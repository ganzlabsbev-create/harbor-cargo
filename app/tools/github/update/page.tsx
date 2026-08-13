"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import UploadZone, { UploadedBlob } from "@/components/UploadZone";
import DiffTreeView, { DiffStatus, buildDiffTree } from "@/components/DiffTreeView";
import RepoIcon from "@/components/RepoIcon";
import ZipWarnings from "@/components/ZipWarnings";
import { useLang } from "@/lib/i18n-context";
import { cleanupBlob, useBlobCleanup } from "@/lib/use-blob-cleanup";

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
  repoOnly: string[];
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

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ commitUrl: string } | null>(null);

  useEffect(() => {
    fetch("/api/repos")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "load_failed");
        setRepos(data.repos);
      })
      .catch((err) => setLoadError(String(err?.message || err)));
  }, []);

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
  }

  const diffTree = useMemo(() => {
    if (!diff) return [];
    const items: { path: string; status: DiffStatus }[] = [
      ...diff.modified.map((p) => ({ path: p, status: "modified" as DiffStatus })),
      ...diff.zipOnly.map((p) => ({ path: p, status: "add" as DiffStatus })),
      ...diff.repoOnly.map((p) => ({ path: p, status: "unchanged" as DiffStatus })),
    ];
    return buildDiffTree(items);
  }, [diff]);

  const addCount = selectedAdd.size;
  const replaceCount = selectedReplace.size;
  const deleteCount = selectedDelete.size;
  const totalChanges = addCount + replaceCount + deleteCount;

  async function handleCommit() {
    if (!blob || !selected || totalChanges === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const [owner, repo] = selected.full_name.split("/");
      const changes = [
        ...[...selectedReplace].map((p) => ({ path: p, action: "replace" })),
        ...[...selectedAdd].map((p) => ({ path: p, action: "add" })),
        ...[...selectedDelete].map((p) => ({ path: p, action: "delete" })),
      ];
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
                  <div className="max-h-[28rem] overflow-y-auto">
                    <DiffTreeView
                      nodes={diffTree}
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
    </main>
  );
}
