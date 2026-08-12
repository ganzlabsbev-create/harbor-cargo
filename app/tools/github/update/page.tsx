"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import UploadZone from "@/components/UploadZone";
import { useLang } from "@/lib/i18n-context";

interface RepoOption {
  name: string;
  full_name: string;
  default_branch: string;
  updated_at: string;
}

export default function UpdateRepoPage() {
  const { t } = useLang();
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RepoOption | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [pushing, setPushing] = useState(false);
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

  function handleAnalyzed(f: File, data: any) {
    setFile(f);
    setAnalysis(data);
  }

  async function handlePush() {
    if (!file || !selected) return;
    setPushing(true);
    setError(null);
    try {
      const [owner, repo] = selected.full_name.split("/");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "update");
      formData.append("owner", owner);
      formData.append("repo", repo);
      formData.append("branch", selected.default_branch);
      formData.append("commitMessage", commitMessage || t("commit_message_placeholder"));
      const res = await fetch("/api/push", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "push_failed");
      setResult({ commitUrl: data.commitUrl });
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
                    className="flex items-center justify-between rounded-xl border border-base-border bg-base-surface px-4 py-3 text-left text-sm text-ink transition active:scale-[0.99]"
                  >
                    <span className="font-medium">{r.full_name}</span>
                    <span className="text-xs text-ink-faint">{r.default_branch}</span>
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
              <button onClick={() => setSelected(null)} className="text-xs text-harbor-orange">
                {t("change_repo")}
              </button>
            </div>

            {!analysis ? (
              <UploadZone onAnalyzed={handleAnalyzed} />
            ) : (
              <>
                <div className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
                  <p className="text-sm text-ink-dim">
                    {t("detected")}: <span className="font-medium text-ink">{analysis.framework}</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-dim">
                    {analysis.fileCount} {t("files_count")}
                  </p>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-dim">{t("commit_message_label")}</span>
                  <input
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder={t("commit_message_placeholder")}
                    className="rounded-xl border border-base-border bg-base-surface px-4 py-3 text-ink outline-none focus:border-harbor-orange"
                  />
                </label>

                {error && <p className="text-sm text-accent-red">{error}</p>}

                <button
                  onClick={handlePush}
                  disabled={pushing}
                  className="flex items-center justify-center gap-2 rounded-xl bg-harbor-orange px-5 py-3.5 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
                >
                  {pushing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> {t("pushing")}
                    </>
                  ) : (
                    t("confirm_push_button")
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
