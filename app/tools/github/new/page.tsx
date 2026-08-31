"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, CheckCircle2, ExternalLink, Loader2, FolderTree } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import UploadZone, { UploadedBlob } from "@/components/UploadZone";
import EditableTreeView from "@/components/EditableTreeView";
import ZipWarnings from "@/components/ZipWarnings";
import ConfirmMoveDialog from "@/components/ConfirmMoveDialog";
import { useLang } from "@/lib/i18n-context";
import { useBlobCleanup } from "@/lib/use-blob-cleanup";
import { flattenFiles, buildTreeFromPaths, listFolderPaths, basename, computeMoveTarget, findMoveCollision, dedupeMoveTarget } from "@/lib/tree-utils";

interface AnalyzeResult {
  ok: true;
  framework: string;
  buildCommand: string | null;
  fileCount: number;
  tree: any[];
  warnings?: { oversizedFiles: string[]; caseCollisions: string[][]; skippedUnsafePaths: string[] };
}

function NewRepoPage() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  // Carried over from Harbor Preview (?blobUrl&blobPathname&fileName) — the
  // ZIP was already uploaded and analyzed there, so this skips straight to
  // the tree + confirm screen instead of asking the user to upload again.
  const carriedBlobUrl = searchParams.get("blobUrl");
  const carriedBlobPathname = searchParams.get("blobPathname");
  const carriedFileName = searchParams.get("fileName") || "";

  const [blob, setBlob] = useState<UploadedBlob | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [carryError, setCarryError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ repoUrl: string } | null>(null);
  // Maps original extracted path -> current (possibly dragged-to) path.
  // Only entries that actually changed are sent to the server on push.
  const [pathMap, setPathMap] = useState<Record<string, string>>({});
  // Original extracted paths dropped via "replace" on a drag collision — the
  // server deletes these from the extracted ZIP before pushing (see
  // app/api/push/route.ts) so the file they were replaced by can actually
  // take that spot instead of both ending up in the repo.
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());
  const [pendingMove, setPendingMove] = useState<{
    originalPath: string;
    currentPath: string;
    targetFolder: string;
    candidate: string;
    collidingPath: string;
    collidingKind: "file" | "folder";
  } | null>(null);
  // Real, measured progress for the push step — {current, total} blobs
  // completed, streamed from /api/push as each one actually lands. Never a
  // timer/guess; see handlePush below.
  const [pushProgress, setPushProgress] = useState<{ current: number; total: number } | null>(null);

  // Deletes the uploaded blob if the user leaves without ever pushing.
  useBlobCleanup(result ? null : blob);

  function handleAnalyzed(b: UploadedBlob, data: AnalyzeResult, fileName: string) {
    setBlob(b);
    setAnalysis(data);
    const original = flattenFiles(data.tree);
    setPathMap(Object.fromEntries(original.map((p) => [p, p])));
    if (!repoName) {
      setRepoName(fileName.replace(/\.zip$/i, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!carriedBlobUrl || !carriedBlobPathname || analysis) return;
    (async () => {
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl: carriedBlobUrl, blobPathname: carriedBlobPathname }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "analyze_failed");
        handleAnalyzed({ url: carriedBlobUrl, pathname: carriedBlobPathname }, data, carriedFileName);
      } catch (err: any) {
        setCarryError(String(err?.message || err));
      }
    })();
  }, [carriedBlobUrl, carriedBlobPathname]);

  const displayTree = useMemo(() => buildTreeFromPaths(Object.values(pathMap)), [pathMap]);

  function handleMove(currentPath: string, targetFolder: string) {
    const originalPath = Object.keys(pathMap).find((k) => pathMap[k] === currentPath);
    if (!originalPath) return;
    const candidate = computeMoveTarget(currentPath, targetFolder);
    if (candidate === currentPath) return;

    const folderPaths = listFolderPaths(displayTree);
    const collision = findMoveCollision(candidate, currentPath, Object.values(pathMap), folderPaths);
    if (collision) {
      // Same-name file (or an existing folder) already sits at the target —
      // ask before doing anything, instead of silently renaming (the old
      // behavior) or, worse, silently landing a file on top of a folder.
      setPendingMove({ originalPath, currentPath, targetFolder, candidate, collidingPath: collision.path, collidingKind: collision.kind });
      return;
    }
    setPathMap((prev) => ({ ...prev, [originalPath]: candidate }));
  }

  function resolvePendingMove(action: "replace" | "rename") {
    if (!pendingMove) return;
    const { originalPath, currentPath, targetFolder, candidate, collidingPath, collidingKind } = pendingMove;
    // A folder can't be replaced by a dropped file — ConfirmMoveDialog
    // already hides the "replace" button for this case, but guard here too.
    if (collidingKind === "folder" && action === "replace") {
      setPendingMove(null);
      return;
    }

    if (action === "rename") {
      const folderPaths = listFolderPaths(displayTree);
      const deduped = dedupeMoveTarget(candidate, currentPath, targetFolder, Object.values(pathMap), folderPaths);
      setPathMap((prev) => ({ ...prev, [originalPath]: deduped }));
    } else {
      const collidingKey = Object.keys(pathMap).find((k) => pathMap[k] === collidingPath && k !== originalPath);
      setPathMap((prev) => {
        const next = { ...prev, [originalPath]: candidate };
        if (collidingKey) delete next[collidingKey];
        return next;
      });
      if (collidingKey) setExcludedPaths((prev) => new Set(prev).add(collidingKey));
    }
    setPendingMove(null);
  }

  async function handlePush() {
    if (!blob || !repoName) return;
    setPushing(true);
    setPushProgress(null);
    setError(null);
    try {
      const moves = Object.entries(pathMap)
        .filter(([from, to]) => from !== to)
        .map(([from, to]) => ({ from, to }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          mode: "new",
          repoName,
          private: String(isPrivate),
          moves,
          excludePaths: Array.from(excludedPaths),
        }),
      });

      // Non-streamed failure (validation before the blob loop even starts,
      // e.g. not_authenticated/invalid_zip/file_too_large) — plain JSON.
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/x-ndjson")) {
        const data = await res.json();
        throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "push_failed");
      }

      // Streamed: one JSON line per event as each blob actually completes.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let finalData: any = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "progress") {
            setPushProgress({ current: event.current, total: event.total });
          } else if (event.type === "done") {
            finalData = event;
          }
        }
      }
      if (!finalData || !finalData.ok) {
        throw new Error([finalData?.error, finalData?.detail].filter(Boolean).join(": ") || "push_failed");
      }
      setResult({ repoUrl: finalData.repoUrl });
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setPushing(false);
      setPushProgress(null);
    }
  }

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6 md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        <Link href="/tools/github" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <AuthGate next="/tools/github/new">
        {result ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-8 text-center shadow-card">
            <CheckCircle2 size={40} className="text-accent-green" />
            <p className="font-display text-lg font-semibold text-ink">{t("push_success")}</p>
            <a
              href={result.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl bg-harbor-blue px-5 py-3 font-medium text-white shadow-glow-blue"
            >
              {t("view_repo")} <ExternalLink size={16} />
            </a>
          </div>
        ) : (
          <>
            {!analysis ? (
              carriedBlobUrl && !carryError ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-base-border bg-base-surface p-8 text-sm text-ink-dim shadow-card">
                  <Loader2 size={18} className="animate-spin" /> {t("upload_uploading")}
                </div>
              ) : (
                <>
                  {carryError && <p className="mb-3 text-sm text-accent-red">{carryError}</p>}
                  <UploadZone onAnalyzed={handleAnalyzed} />
                </>
              )
            ) : (
              <div className="flex flex-col gap-5">
                <div className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
                  <p className="text-sm text-ink-dim">
                    {t("detected")}: <span className="font-medium text-ink">{analysis.framework}</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-dim">
                    {analysis.fileCount} {t("files_count")}
                  </p>
                  {analysis.buildCommand && (
                    <p className="mt-1 text-sm text-ink-dim">
                      {t("build_command")}: <code className="text-harbor-orange">{analysis.buildCommand}</code>
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-1 text-xs text-ink-faint">
                    <FolderTree size={14} /> {t("file_structure")}
                  </div>
                  <p className="mt-1 text-[11px] text-ink-faint">{t("drag_to_move_hint")}</p>
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-base-border bg-base-bg p-2">
                    <EditableTreeView nodes={displayTree} onMove={handleMove} />
                  </div>
                </div>

                <ZipWarnings warnings={analysis.warnings} />

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-dim">{t("new_repo_name_label")}</span>
                  <input
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder={t("new_repo_name_placeholder")}
                    className="rounded-xl border border-base-border bg-base-surface px-4 py-3 text-ink outline-none focus:border-harbor-orange"
                  />
                </label>

                <div className="flex gap-2">
                  {[
                    { val: true, label: t("repo_visibility_private") },
                    { val: false, label: t("repo_visibility_public") },
                  ].map((opt) => (
                    <button
                      key={String(opt.val)}
                      onClick={() => setIsPrivate(opt.val)}
                      className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                        isPrivate === opt.val
                          ? "border-harbor-orange bg-harbor-orange/10 text-harbor-orange"
                          : "border-base-border text-ink-dim"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {error && <p className="text-sm text-accent-red">{error}</p>}

                <button
                  onClick={handlePush}
                  disabled={pushing || !repoName}
                  className="relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-harbor-orange px-5 py-3.5 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
                >
                  {pushing && pushProgress && (
                    // Real, measured progress — a colored layer filling
                    // left-to-right, width = actual completed/total blobs,
                    // streamed from /api/push as each one lands.
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-150 ease-out"
                      style={{ width: `${(pushProgress.current / Math.max(pushProgress.total, 1)) * 100}%` }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {pushing ? (
                      <>
                        <Loader2 size={18} className="animate-spin" /> {t("pushing")}
                        {pushProgress && (
                          <span className="opacity-80">
                            ({pushProgress.current}/{pushProgress.total})
                          </span>
                        )}
                      </>
                    ) : (
                      t("confirm_push_button")
                    )}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
        </AuthGate>
      </div>
      {pendingMove && (
        <ConfirmMoveDialog
          fileName={basename(pendingMove.collidingPath)}
          kind={pendingMove.collidingKind}
          onReplace={() => resolvePendingMove("replace")}
          onRename={() => resolvePendingMove("rename")}
          onCancel={() => setPendingMove(null)}
          t={t}
        />
      )}
    </main>
  );
}

export default function NewRepoPageRoute() {
  return (
    <Suspense fallback={null}>
      <NewRepoPage />
    </Suspense>
  );
}
