"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import UploadZone, { UploadedBlob } from "@/components/UploadZone";
import DiffTreeView, { DiffStatus, buildDiffTree } from "@/components/DiffTreeView";
import RepoIcon from "@/components/RepoIcon";
import ZipWarnings from "@/components/ZipWarnings";
import ConfirmMoveDialog from "@/components/ConfirmMoveDialog";
import { useLang } from "@/lib/i18n-context";
import { cleanupBlob, useBlobCleanup } from "@/lib/use-blob-cleanup";
import { useElapsedSeconds } from "@/lib/use-elapsed";
import { basename, computeMoveTarget, findMoveCollision, dedupeMoveTarget } from "@/lib/tree-utils";

interface RepoOption {
  name: string;
  full_name: string;
  default_branch: string;
  updated_at: string;
  language?: string | null;
  logoUrl?: string | null;
}

interface DiffPayload {
  modified: string[];
  zipOnly: string[];
  repoOnly: { path: string; sha: string }[];
}

function toggle(set: Set<string>, path: string): Set<string> {
  const next = new Set(set);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

export default function UpdateRepoPage() {
  const { t } = useLang();
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RepoOption | null>(null);

  const [blob, setBlob] = useState<UploadedBlob | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [repoEmpty, setRepoEmpty] = useState(false);

  const [selectedReplace, setSelectedReplace] = useState<Set<string>>(new Set());
  const [selectedAdd, setSelectedAdd] = useState<Set<string>>(new Set());
  const [selectedDelete, setSelectedDelete] = useState<Set<string>>(new Set());
  const [diffWarnings, setDiffWarnings] = useState<{ oversizedFiles: string[]; caseCollisions: string[][]; skippedUnsafePaths: string[] } | null>(null);

  // Maps each file's original diff path -> its current (possibly
  // dragged-to) path. Keyed by origPath so a file's add/replace/delete
  // status survives being moved. repoOnly files also get an entry here so
  // they can be dragged into a folder (a pure repo-side rename) even though
  // they were never in the ZIP — see repoOnlyShas below.
  const [pathMap, setPathMap] = useState<Record<string, string>>({});
  // origPath -> blob sha, for repoOnly files only. Lets a repo-side rename
  // reuse the file's existing content instead of re-uploading it.
  const [repoOnlyShas, setRepoOnlyShas] = useState<Record<string, string>>({});
  const [pendingMove, setPendingMove] = useState<{
    origPath: string;
    currentPath: string;
    targetFolder: string;
    candidate: string;
    collidingPath: string;
  } | null>(null);

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ commitUrl: string } | null>(null);
  const commitElapsed = useElapsedSeconds(committing);

  const reposLoadElapsed = useElapsedSeconds(!repos && !loadError);

  useEffect(() => {
    fetch("/api/repos")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "load_failed");
        setRepos(data.repos);
      })
      .catch((err) => setLoadError(String(err?.message || err)));
  }, []);

  // Repo icons load separately, in small batches, after the list itself
  // shows up — a logo lookup can cost several GitHub API calls each, so
  // doing all of them up front would make the list slow to appear. This
  // way every repo eventually gets a real attempt at its icon (not just
  // the first page), and the grid fills in progressively instead of
  // leaving later repos stuck on the generic color-dot fallback.
  useEffect(() => {
    if (!repos || repos.length === 0) return;
    let cancelled = false;
    const BATCH_SIZE = 15;

    async function loadLogosProgressively() {
      for (let i = 0; i < repos!.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = repos!.slice(i, i + BATCH_SIZE).map((r) => {
          const [owner, name] = r.full_name.split("/");
          return { owner, name };
        });
        try {
          const res = await fetch("/api/repos/logos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ repos: batch }),
          });
          const data = await res.json();
          if (cancelled || !data.ok) continue;
          setRepos((prev) =>
            prev
              ? prev.map((r) => (r.full_name in data.logos ? { ...r, logoUrl: data.logos[r.full_name] } : r))
              : prev
          );
        } catch {
          // this batch failed (e.g. transient network issue) — move on to
          // the next one rather than blocking the rest of the list
        }
      }
    }

    loadLogosProgressively();
    return () => {
      cancelled = true;
    };
    // Only re-run when a fresh repo list comes in, not on every logo update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos === null]);

  // Deletes the uploaded blob if the user leaves without ever committing.
  useBlobCleanup(result ? null : blob);

  function handleDiffed(b: UploadedBlob, data: any) {
    setBlob(b);
    setDiff(data.diff);
    setRepoEmpty(Boolean(data.repoEmpty));
    setDiffWarnings(data.warnings || null);
    // Default: select everything so a single tap commits the whole update,
    // same as the previous behavior — user can uncheck what they don't want.
    setSelectedReplace(new Set(data.diff.modified));
    setSelectedAdd(new Set(data.diff.zipOnly));
    setSelectedDelete(new Set());
    const allOrigPaths: string[] = [
      ...data.diff.modified,
      ...data.diff.zipOnly,
      ...data.diff.repoOnly.map((r: { path: string }) => r.path),
    ];
    setPathMap(Object.fromEntries(allOrigPaths.map((p) => [p, p])));
    setRepoOnlyShas(Object.fromEntries(data.diff.repoOnly.map((r: { path: string; sha: string }) => [r.path, r.sha])));
  }

  const diffTree = useMemo(() => {
    if (!diff) return [];
    const items: { origPath: string; path: string; status: DiffStatus }[] = [
      ...diff.modified.map((p) => ({ origPath: p, path: pathMap[p] ?? p, status: "modified" as DiffStatus })),
      ...diff.zipOnly.map((p) => ({ origPath: p, path: pathMap[p] ?? p, status: "add" as DiffStatus })),
      ...diff.repoOnly.map((r) => ({ origPath: r.path, path: pathMap[r.path] ?? r.path, status: "unchanged" as DiffStatus })),
    ];
    return buildDiffTree(items);
  }, [diff, pathMap]);

  /** modified/add/unchanged for a given origPath, or null if it's not part of the current diff. */
  function statusOf(origPath: string): DiffStatus | null {
    if (!diff) return null;
    if (diff.modified.includes(origPath)) return "modified";
    if (diff.zipOnly.includes(origPath)) return "add";
    if (diff.repoOnly.some((r) => r.path === origPath)) return "unchanged";
    return null;
  }

  function handleMove(origPath: string, targetFolder: string) {
    // Files marked for deletion can't be dragged — DiffTreeView already
    // disables their drag handle, but guard here too in case of a stray call.
    if (selectedDelete.has(origPath)) return;
    const currentPath = pathMap[origPath];
    if (currentPath === undefined) return;
    const candidate = computeMoveTarget(currentPath, targetFolder);
    if (candidate === currentPath) return;

    const collidingPath = findMoveCollision(candidate, currentPath, Object.values(pathMap));
    if (collidingPath) {
      setPendingMove({ origPath, currentPath, targetFolder, candidate, collidingPath });
      return;
    }
    setPathMap((prev) => ({ ...prev, [origPath]: candidate }));
  }

  function resolvePendingMove(action: "replace" | "rename") {
    if (!pendingMove) return;
    const { origPath, currentPath, targetFolder, candidate, collidingPath } = pendingMove;

    if (action === "rename") {
      const deduped = dedupeMoveTarget(candidate, currentPath, targetFolder, Object.values(pathMap));
      setPathMap((prev) => ({ ...prev, [origPath]: deduped }));
      setPendingMove(null);
      return;
    }

    const collidingOrigPath = Object.keys(pathMap).find((k) => pathMap[k] === collidingPath && k !== origPath);
    const collidingStatus = collidingOrigPath ? statusOf(collidingOrigPath) : null;

    if (collidingOrigPath && collidingStatus === "unchanged") {
      // Existing, untouched repo file — "replace" means it should no longer
      // exist at that path, so mark it for deletion the same way the
      // checkbox would, then let the dragged file take its spot.
      setSelectedDelete((s) => new Set(s).add(collidingOrigPath));
      setPathMap((prev) => ({ ...prev, [origPath]: candidate }));
    } else if (collidingOrigPath) {
      // The thing in the way is itself content from this ZIP (modified/add)
      // — it might be selected for the commit, so never silently drop it.
      // Bump it to the next free -2/-3 name instead and give the dragged
      // file the clean one it asked for.
      const bumped = dedupeMoveTarget(collidingPath, currentPath, targetFolder, Object.values(pathMap));
      setPathMap((prev) => ({ ...prev, [collidingOrigPath]: bumped, [origPath]: candidate }));
    } else {
      setPathMap((prev) => ({ ...prev, [origPath]: candidate }));
    }
    setPendingMove(null);
  }

  const addCount = selectedAdd.size;
  const replaceCount = selectedReplace.size;
  const deleteCount = selectedDelete.size;
  const movedCount = useMemo(
    () => Object.entries(pathMap).filter(([orig, cur]) => orig !== cur && !selectedDelete.has(orig)).length,
    [pathMap, selectedDelete]
  );
  // Renamed repoOnly files aren't part of any selection set (they're neither
  // "add" nor "replace" nor "delete"), so they need to be counted separately
  // to enable the confirm button when a rename is the only change made.
  const repoOnlyMovedCount = useMemo(() => {
    if (!diff) return 0;
    return diff.repoOnly.filter((r) => !selectedDelete.has(r.path) && (pathMap[r.path] ?? r.path) !== r.path).length;
  }, [diff, pathMap, selectedDelete]);
  const totalChanges = addCount + replaceCount + deleteCount + repoOnlyMovedCount;

  async function handleCommit() {
    if (!blob || !selected || !diff || totalChanges === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const [owner, repo] = selected.full_name.split("/");

      const changes: { path: string; action: "add" | "replace" | "delete"; zipPath?: string; sha?: string }[] = [];

      for (const origPath of selectedReplace) {
        const cur = pathMap[origPath] ?? origPath;
        if (cur === origPath) {
          changes.push({ path: origPath, action: "replace" });
        } else {
          // Moved while being replaced: the old repo path shouldn't keep a
          // stale copy, so drop it and add the new content at the new path.
          changes.push({ path: origPath, action: "delete" });
          changes.push({ path: cur, action: "add", zipPath: origPath });
        }
      }
      for (const origPath of selectedAdd) {
        const cur = pathMap[origPath] ?? origPath;
        changes.push({ path: cur, action: "add", zipPath: cur !== origPath ? origPath : undefined });
      }
      for (const origPath of selectedDelete) {
        changes.push({ path: origPath, action: "delete" });
      }
      // repoOnly files that were dragged to a new folder without being
      // marked for deletion — a pure repo-side rename, reusing the existing
      // blob sha so the content doesn't need to round-trip through the ZIP.
      for (const r of diff.repoOnly) {
        if (selectedDelete.has(r.path)) continue;
        const cur = pathMap[r.path] ?? r.path;
        if (cur !== r.path) {
          changes.push({ path: r.path, action: "delete" });
          changes.push({ path: cur, action: "add", sha: repoOnlyShas[r.path] });
        }
      }

      const res = await fetch("/api/commit-diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          owner,
          repo,
          branch: selected.default_branch,
          commitMessage: commitMessage || t("commit_message_placeholder"),
          changes,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "commit_failed");
      setResult({ commitUrl: data.commitUrl });
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setCommitting(false);
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
              href={result.commitUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl bg-harbor-blue px-5 py-3 font-medium text-white shadow-glow-blue"
            >
              {t("view_commit")} <ExternalLink size={16} />
            </a>
          </div>
        ) : !selected ? (
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-ink-dim">{t("select_repo_label")}</label>
            {loadError ? (
              <p className="text-sm text-accent-red">{loadError}</p>
            ) : !repos ? (
              <p className="flex items-center gap-2 text-sm text-ink-dim">
                <Loader2 size={16} className="animate-spin" /> {t("loading_repos")}
                {reposLoadElapsed > 0 && <span className="text-ink-faint">({reposLoadElapsed}{t("seconds_short")})</span>}
              </p>
            ) : repos.length === 0 ? (
              <p className="text-sm text-ink-dim">{t("no_repos")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {repos.map((r) => (
                  <button
                    key={r.full_name}
                    onClick={() => setSelected(r)}
                    className="flex items-center gap-3 rounded-xl border border-base-border bg-base-surface px-4 py-3 text-left text-sm text-ink transition active:scale-[0.99]"
                  >
                    <RepoIcon logoUrl={r.logoUrl} language={r.language} />
                    <span className="min-w-0 flex-1 truncate font-medium">{r.full_name}</span>
                    <span className="shrink-0 text-xs text-ink-faint">{r.default_branch}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between rounded-xl border border-base-border bg-base-surface px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{selected.full_name}</p>
                <p className="text-xs text-ink-faint">
                  {t("branch_label")}: {selected.default_branch}
                </p>
              </div>
              <button
                onClick={() => {
                  // The uploaded blob is only reused by /api/commit-diff — if
                  // we're leaving before that, nothing will ever delete it
                  // otherwise, so clean it up explicitly here.
                  if (blob) cleanupBlob(blob.pathname);
                  setSelected(null);
                  setBlob(null);
                  setDiff(null);
                  setDiffWarnings(null);
                  setPathMap({});
                  setRepoOnlyShas({});
                }}
                className="text-xs text-harbor-orange"
              >
                {t("change_repo")}
              </button>
            </div>

            {!diff ? (
              <UploadZone
                onAnalyzed={handleDiffed}
                endpoint="/api/diff"
                extraFields={{ owner: selected.full_name.split("/")[0], repo: selected.full_name.split("/")[1], branch: selected.default_branch }}
                uploadingLabel={t("loading_diff")}
              />
            ) : (
              <>
                {repoEmpty && <p className="text-xs text-ink-faint">{t("repo_empty_note")}</p>}

                <ZipWarnings warnings={diffWarnings} />

                <div className="rounded-2xl border border-base-border bg-base-surface p-3 shadow-card">
                  <p className="mb-1 px-1 text-[11px] uppercase tracking-wide text-ink-faint">
                    {t("file_structure")}
                  </p>
                  <p className="mb-1 px-1 text-[11px] text-ink-faint">{t("drag_to_move_hint")}</p>
                  <div className="max-h-[28rem] overflow-y-auto">
                    <DiffTreeView
                      nodes={diffTree}
                      onMove={handleMove}
                      selectedReplace={selectedReplace}
                      selectedAdd={selectedAdd}
                      selectedDelete={selectedDelete}
                      onToggleReplace={(p) => setSelectedReplace((s) => toggle(s, p))}
                      onToggleAdd={(p) => setSelectedAdd((s) => toggle(s, p))}
                      onToggleDelete={(p) => setSelectedDelete((s) => toggle(s, p))}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
                  <p className="mb-2 text-xs font-medium text-ink-dim">{t("diff_summary_title")}</p>
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-accent-green/10 px-2.5 py-1 text-accent-green">
                      {t("summary_add")} {addCount} {t("summary_files")}
                    </span>
                    <span className="rounded-full bg-harbor-orange/10 px-2.5 py-1 text-harbor-orange">
                      {t("summary_replace")} {replaceCount} {t("summary_files")}
                    </span>
                    <span className="rounded-full bg-accent-red/10 px-2.5 py-1 text-accent-red">
                      {t("summary_delete")} {deleteCount} {t("summary_files")}
                    </span>
                    {movedCount > 0 && (
                      <span className="rounded-full bg-harbor-blue/10 px-2.5 py-1 text-harbor-blue">
                        {t("summary_moved")} {movedCount} {t("summary_files")}
                      </span>
                    )}
                  </div>

                  <label className="mb-1.5 block text-xs font-medium text-ink-dim">
                    {t("commit_message_label")}
                  </label>
                  <input
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder={t("commit_message_placeholder")}
                    className="mb-4 w-full rounded-xl border border-base-border bg-base-surface2 px-4 py-3 text-sm text-ink outline-none focus:border-harbor-orange"
                  />

                  {error && <p className="mb-3 text-sm text-accent-red">{error}</p>}

                  <button
                    onClick={handleCommit}
                    disabled={committing || totalChanges === 0}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-harbor-orange px-5 py-3.5 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
                  >
                    {committing ? (
                      <>
                        <Loader2 size={18} className="animate-spin" /> {t("committing")}
                        {commitElapsed > 0 && <span className="opacity-80">({commitElapsed}{t("seconds_short")})</span>}
                      </>
                    ) : (
                      t("confirm_commit_button")
                    )}
                  </button>
                  {totalChanges === 0 && (
                    <p className="mt-2 text-center text-[11px] text-ink-faint">{t("no_changes_selected")}</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {pendingMove && (
        <ConfirmMoveDialog
          fileName={basename(pendingMove.collidingPath)}
          onReplace={() => resolvePendingMove("replace")}
          onRename={() => resolvePendingMove("rename")}
          onCancel={() => setPendingMove(null)}
          t={t}
        />
      )}
    </main>
  );
}
