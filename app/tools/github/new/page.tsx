"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, CheckCircle2, ExternalLink, Loader2, FolderTree } from "lucide-react";
import Header from "@/components/Header";
import UploadZone, { UploadedBlob } from "@/components/UploadZone";
import EditableTreeView from "@/components/EditableTreeView";
import ZipWarnings from "@/components/ZipWarnings";
import { useLang } from "@/lib/i18n-context";
import { useBlobCleanup } from "@/lib/use-blob-cleanup";
import { flattenFiles, buildTreeFromPaths, resolveMoveTarget } from "@/lib/tree-utils";
import { useElapsedSeconds } from "@/lib/use-elapsed";

interface AnalyzeResult {
  ok: true;
  framework: string;
  buildCommand: string | null;
  fileCount: number;
  tree: any[];
  warnings?: { oversizedFiles: string[]; caseCollisions: string[][]; skippedUnsafePaths: string[] };
}

export default function NewRepoPage() {
  const { t } = useLang();
  const [blob, setBlob] = useState<UploadedBlob | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ repoUrl: string } | null>(null);
  // Maps original extracted path -> current (possibly dragged-to) path.
  // Only entries that actually changed are sent to the server on push.
  const [pathMap, setPathMap] = useState<Record<string, string>>({});
  const pushElapsed = useElapsedSeconds(pushing);

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

  const displayTree = useMemo(() => buildTreeFromPaths(Object.values(pathMap)), [pathMap]);

  function handleMove(currentPath: string, targetFolder: string) {
    setPathMap((prev) => {
      const originalPath = Object.keys(prev).find((k) => prev[k] === currentPath);
      if (!originalPath) return prev;
      const newPath = resolveMoveTarget(currentPath, targetFolder, Object.values(prev));
      if (newPath === currentPath) return prev;
      return { ...prev, [originalPath]: newPath };
    });
  }

  async function handlePush() {
    if (!blob || !repoName) return;
    setPushing(true);
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
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "push_failed");
      setResult({ repoUrl: data.repoUrl });
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setPushing(false);
    }
  }

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/tools/github" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

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
              <UploadZone onAnalyzed={handleAnalyzed} />
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
                  className="flex items-center justify-center gap-2 rounded-xl bg-harbor-orange px-5 py-3.5 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
                >
                  {pushing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> {t("pushing")}
                      {pushElapsed > 0 && <span className="opacity-80">({pushElapsed}{t("seconds_short")})</span>}
                    </>
                  ) : (
                    t("confirm_push_button")
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
