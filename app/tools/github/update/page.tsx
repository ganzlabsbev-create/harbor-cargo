"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import UploadZone, { UploadedBlob } from "@/components/UploadZone";
import DiffTreeView, { DiffStatus, buildDiffTree } from "@/components/DiffTreeView";
import RepoIcon from "@/components/RepoIcon";
import ZipWarnings from "@/components/ZipWarnings";
import ConfirmMoveDialog from "@/components/ConfirmMoveDialog";
import DownloadProjectModal from "@/components/DownloadProjectModal";
import { Settings2, Download } from "lucide-react";
import { useLang } from "@/lib/i18n-context";
import { cleanupBlob, useBlobCleanup } from "@/lib/use-blob-cleanup";
import { basename, computeMoveTarget, findMoveCollision, dedupeMoveTarget, listFolderFullPaths } from "@/lib/tree-utils";
import { addRecent, removeRecent } from "@/lib/recents";

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

function UpdateRepoPage() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  // Carried over from Harbor Preview (?blobUrl&blobPathname&fileName) — the
  // ZIP is already uploaded, so once a repo is picked below we run the diff
  // against it directly instead of showing the upload step again.
  const carriedBlobUrl = searchParams.get("blobUrl");
  const carriedBlobPathname = searchParams.get("blobPathname");
  const [carryError, setCarryError] = useState<string | null>(null);
  const [carryConsumed, setCarryConsumed] = useState(false);
  // Deep-link from the home page's "Recent" row (?owner=&repo=&branch=) —
  // skips straight past the repo picker below instead of showing it.
  const deepOwner = searchParams.get("owner");
  const deepRepo = searchParams.get("repo");
  const deepBranch = searchParams.get("branch");
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);
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
  // origPaths of repoOnly ("unchanged") files that got replaced-away by a
  // dragged file landing on their path — hidden from the tree instead of
  // being marked for deletion (see resolvePendingMove below for why a
  // separate delete instruction here is actively harmful, not just redundant).
  const [excludedRepoOnly, setExcludedRepoOnly] = useState<Set<string>>(new Set());
  // origPaths of zipOnly ("add") files that got reclassified to display/act
  // as a replace after landing on an existing repo file's path.
  const [forcedReplace, setForcedReplace] = useState<Set<string>>(new Set());

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
    collidingKind: "file" | "folder";
  } | null>(null);

  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ commitUrl: string } | null>(null);
  // Real, measured progress for the commit step — {current, total} blobs
  // completed, streamed from /api/commit-diff as each one actually lands.
  // Never a timer/guess; see handleCommit below.
  const [commitProgress, setCommitProgress] = useState<{ current: number; total: number } | null>(null);

  // Repo list load is a single atomic fetch with no internal stages — a
  // plain indeterminate spinner is the honest representation here, not a
  // fake percentage or a "still working... (Ns)" counter.

  useEffect(() => {
    fetch("/api/repos")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "load_failed");
        setRepos(data.repos);
      })
      .catch((err) => setLoadError(String(err?.message || err)));
  }, []);

  // Deep-link from the home page's "Recent" row: once the repo list is in,
  // try to auto-select the repo named in the URL instead of showing the
  // picker. If it's gone (renamed/deleted/access revoked), drop the stale
  // recent entry and fall back to the normal picker below.
  useEffect(() => {
    if (!repos || selected || deepLinkConsumed || !deepOwner || !deepRepo) return;
    setDeepLinkConsumed(true);
    const fullName = `${deepOwner}/${deepRepo}`;
    const match = repos.find((r) => r.full_name === fullName);
    if (match) {
      setSelected(match);
    } else {
      removeRecent(`github-update:${fullName}:${deepBranch ?? ""}`);
    }
  }, [repos, selected, deepLinkConsumed, deepOwner, deepRepo, deepBranch]);

  // Record this repo as a "recent" as soon as it's picked (manually or via
  // the deep-link above) — localStorage only, see lib/recents.ts.
  useEffect(() => {
    if (!selected) return;
    const [owner, repo] = selected.full_name.split("/");
    addRecent({
      id: `github-update:${selected.full_name}:${selected.default_branch}`,
      type: "github-update",
      label: selected.full_name,
      sublabel: selected.default_branch,
      href: `/tools/github/update?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(selected.default_branch)}`,
    });
  }, [selected]);

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
    setExcludedRepoOnly(new Set());
    setForcedReplace(new Set());
    const allOrigPaths: string[] = [
      ...data.diff.modified,
      ...data.diff.zipOnly,
      ...data.diff.repoOnly.map((r: { path: string }) => r.path),
    ];
    setPathMap(Object.fromEntries(allOrigPaths.map((p) => [p, p])));
    setRepoOnlyShas(Object.fromEntries(data.diff.repoOnly.map((r: { path: string; sha: string }) => [r.path, r.sha])));
  }

  // Once a repo is selected, if a blob was carried over from Harbor
  // Preview, run the diff against it automatically instead of showing the
  // upload step. Guarded by carryConsumed so it only fires once — after
  // that the flow behaves exactly like the manual-upload path.
  useEffect(() => {
    if (!selected || !carriedBlobUrl || !carriedBlobPathname || carryConsumed) return;
    setCarryConsumed(true);
    (async () => {
      try {
        const res = await fetch("/api/diff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: carriedBlobUrl,
            blobPathname: carriedBlobPathname,
            owner: selected.full_name.split("/")[0],
            repo: selected.full_name.split("/")[1],
            branch: selected.default_branch,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "diff_failed");
        handleDiffed({ url: carriedBlobUrl, pathname: carriedBlobPathname }, data);
      } catch (err: any) {
        setCarryError(String(err?.message || err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, carriedBlobUrl, carriedBlobPathname, carryConsumed]);

  const diffTree = useMemo(() => {
    if (!diff) return [];
    const items: { origPath: string; path: string; status: DiffStatus }[] = [
      ...diff.modified.map((p) => ({ origPath: p, path: pathMap[p] ?? p, status: "modified" as DiffStatus })),
      ...diff.zipOnly.map((p) => ({
        origPath: p,
        path: pathMap[p] ?? p,
        status: (forcedReplace.has(p) ? "modified" : "add") as DiffStatus,
      })),
      ...diff.repoOnly
        .filter((r) => !excludedRepoOnly.has(r.path))
        .map((r) => ({ origPath: r.path, path: pathMap[r.path] ?? r.path, status: "unchanged" as DiffStatus })),
    ];
    return buildDiffTree(items);
  }, [diff, pathMap, excludedRepoOnly, forcedReplace]);

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

    const folderPaths = listFolderFullPaths(diffTree);
    const collision = findMoveCollision(candidate, currentPath, Object.values(pathMap), folderPaths);
    if (collision) {
      setPendingMove({ origPath, currentPath, targetFolder, candidate, collidingPath: collision.path, collidingKind: collision.kind });
      return;
    }
    setPathMap((prev) => ({ ...prev, [origPath]: candidate }));
  }

  function resolvePendingMove(action: "replace" | "rename") {
    if (!pendingMove) return;
    const { origPath, currentPath, targetFolder, candidate, collidingPath, collidingKind } = pendingMove;
    // A folder can't be replaced by a dropped file — ConfirmMoveDialog
    // already hides the "replace" button for this case, but guard here too.
    if (collidingKind === "folder" && action === "replace") {
      setPendingMove(null);
      return;
    }

    if (action === "rename") {
      const folderPaths = listFolderFullPaths(diffTree);
      const deduped = dedupeMoveTarget(candidate, currentPath, targetFolder, Object.values(pathMap), folderPaths);
      setPathMap((prev) => ({ ...prev, [origPath]: deduped }));
      setPendingMove(null);
      return;
    }

    const collidingOrigPath = Object.keys(pathMap).find((k) => pathMap[k] === collidingPath && k !== origPath);
    const collidingStatus = collidingOrigPath ? statusOf(collidingOrigPath) : null;

    if (collidingOrigPath && collidingStatus === "unchanged") {
      // Existing, untouched repo file at the target path. Its content gets
      // overwritten automatically once the dragged file's add/replace entry
      // lands at this same path (GitHub replaces in place when a Tree entry
      // reuses an existing path under base_tree) — a separate delete
      // instruction for that path is not just redundant but harmful: two
      // Tree entries at one path is ambiguous, GitHub just keeps whichever
      // one it processes last, and since delete would land after add, the
      // file that was just added would silently disappear. So: no delete
      // here, ever. Just hide the old repoOnly row and, if the dragged file
      // was a plain "add", reclassify it to read/act as a "replace".
      setExcludedRepoOnly((s) => new Set(s).add(collidingOrigPath));
      setPathMap((prev) => ({ ...prev, [origPath]: candidate }));
      if (statusOf(origPath) === "add") {
        setSelectedAdd((s) => {
          if (!s.has(origPath)) return s;
          const next = new Set(s);
          next.delete(origPath);
          return next;
        });
        setSelectedReplace((s) => new Set(s).add(origPath));
        setForcedReplace((s) => new Set(s).add(origPath));
      }
      // statusOf(origPath) === "unchanged" (a pure repo-side rename landing
      // on another untouched file) has no "replace" bucket to land in yet —
      // known limitation, left for a follow-up. The dragged file still just
      // takes over the path with no explicit change entry, and the
      // handleCommit safety net below guarantees no duplicate-path entries
      // either way.
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
    setCommitProgress(null);
    setError(null);
    try {
      const [owner, repo] = selected.full_name.split("/");

      const changes: { path: string; action: "add" | "replace" | "delete"; zipPath?: string; sha?: string }[] = [];

      for (const origPath of selectedReplace) {
        const cur = pathMap[origPath] ?? origPath;
        if (forcedReplace.has(origPath)) {
          // This "replace" is actually a zipOnly/add file that got dragged
          // onto an existing repo path (see resolvePendingMove's
          // collidingStatus === "unchanged" branch) — origPath is the
          // file's ORIGINAL zip location, which was never a real repo path
          // to begin with. Emitting a delete for it is not just redundant,
          // it's actively dangerous: if origPath happens to coincide with
          // an unrelated existing repo folder, a bogus `{path: origPath,
          // sha: null, type: "blob"}` tree entry collides with GitHub's own
          // tree object at that path and the commit fails with
          // GitRPC::BadObjectState. There's nothing at origPath to delete,
          // so just add the new content at its (possibly moved)
          // destination — GitHub overwrites in place since `cur` already
          // exists under base_tree.
          changes.push({ path: cur, action: "add", zipPath: origPath });
        } else if (cur === origPath) {
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
        if (selectedDelete.has(r.path) || excludedRepoOnly.has(r.path)) continue;
        const cur = pathMap[r.path] ?? r.path;
        if (cur !== r.path) {
          changes.push({ path: r.path, action: "delete" });
          changes.push({ path: cur, action: "add", sha: repoOnlyShas[r.path] });
        }
      }

      // Safety net: after the fix above this should never trigger, but if
      // any path still ended up with both a delete and an add/replace
      // entry, content always wins — GitHub keeps whichever Tree entry it
      // sees last for a given path, so a stray delete could otherwise
      // silently erase content that was just added. See resolvePendingMove
      // for the root-cause fix this backstops.
      const contentPaths = new Set(changes.filter((c) => c.action === "add" || c.action === "replace").map((c) => c.path));
      const dedupedChanges = changes.filter((c) => c.action !== "delete" || !contentPaths.has(c.path));

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
          changes: dedupedChanges,
        }),
      });

      // Non-streamed failure (validation before the blob loop even starts,
      // e.g. missing_fields/no_file/no_changes) — server sent plain JSON.
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/x-ndjson")) {
        const data = await res.json();
        throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "commit_failed");
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
            setCommitProgress({ current: event.current, total: event.total });
          } else if (event.type === "done") {
            finalData = event;
          }
        }
      }
      if (!finalData || !finalData.ok) {
        throw new Error(
          [finalData?.error, finalData?.detail].filter(Boolean).join(": ") || "commit_failed"
        );
      }
      setResult({ commitUrl: finalData.commitUrl });
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setCommitting(false);
      setCommitProgress(null);
    }
  }

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/tools/github" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <AuthGate next="/tools/github/update">
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
              <div className="flex shrink-0 items-center gap-3">
                <Link
                  href={`/tools/github/settings/${selected.full_name.split("/")[0]}/${selected.full_name.split("/")[1]}`}
                  className="flex items-center gap-1 text-xs text-ink-dim"
                  title={t("gh_settings_title")}
                >
                  <Settings2 size={14} /> {t("gh_settings_title")}
                </Link>
                <button
                  onClick={() => setShowDownloadModal(true)}
                  className="flex items-center gap-1 text-xs text-ink-dim"
                  title={t("download_project_title")}
                >
                  <Download size={14} /> {t("download_project_title")}
                </button>
                <button
                  onClick={() => {
                    // The uploaded blob is only reused by /api/commit-diff — if
                    // we're leaving before that, nothing will ever delete it
                    // otherwise, so clean it up explicitly here.
                    // Only clean up the blob here if it's NOT the one carried
                    // over from Harbor Preview — that one may still be needed
                    // to diff against whichever repo the user picks next.
                    if (blob && blob.pathname !== carriedBlobPathname) cleanupBlob(blob.pathname);
                    setSelected(null);
                    setBlob(null);
                    setDiff(null);
                    setDiffWarnings(null);
                    setPathMap({});
                    setRepoOnlyShas({});
                    setExcludedRepoOnly(new Set());
                    setForcedReplace(new Set());
                    setCarryConsumed(false);
                    setCarryError(null);
                  }}
                  className="text-xs text-harbor-orange"
                >
                  {t("change_repo")}
                </button>
              </div>
            </div>

            {showDownloadModal && (
              <DownloadProjectModal
                owner={selected.full_name.split("/")[0]}
                repo={selected.full_name.split("/")[1]}
                defaultBranch={selected.default_branch}
                onClose={() => setShowDownloadModal(false)}
              />
            )}

            {!diff ? (
              carriedBlobUrl && !carryError ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-base-border bg-base-surface p-8 text-sm text-ink-dim shadow-card">
                  <Loader2 size={18} className="animate-spin" /> {t("loading_diff")}
                </div>
              ) : (
                <>
                  {carryError && <p className="mb-3 text-sm text-accent-red">{carryError}</p>}
                  <UploadZone
                    onAnalyzed={handleDiffed}
                    endpoint="/api/diff"
                    extraFields={{ owner: selected.full_name.split("/")[0], repo: selected.full_name.split("/")[1], branch: selected.default_branch }}
                    uploadingLabel={t("loading_diff")}
                  />
                </>
              )
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
                    className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-harbor-orange px-5 py-3.5 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
                  >
                    {committing && commitProgress && (
                      // Real, measured progress — a colored layer filling
                      // left-to-right, width = actual completed/total blobs,
                      // streamed from /api/commit-diff as each one lands.
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-150 ease-out"
                        style={{ width: `${(commitProgress.current / Math.max(commitProgress.total, 1)) * 100}%` }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {committing ? (
                        <>
                          <Loader2 size={18} className="animate-spin" /> {t("committing")}
                          {commitProgress && (
                            <span className="opacity-80">
                              ({commitProgress.current}/{commitProgress.total})
                            </span>
                          )}
                        </>
                      ) : (
                        t("confirm_commit_button")
                      )}
                    </span>
                  </button>
                  {totalChanges === 0 && (
                    <p className="mt-2 text-center text-[11px] text-ink-faint">{t("no_changes_selected")}</p>
                  )}
                </div>
              </>
            )}
          </div>
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

export default function UpdateRepoPageRoute() {
  return (
    <Suspense fallback={null}>
      <UpdateRepoPage />
    </Suspense>
  );
}
