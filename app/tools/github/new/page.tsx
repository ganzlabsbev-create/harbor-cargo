"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, CheckCircle2, ExternalLink, Loader2, FolderTree } from "lucide-react";
import Header from "@/components/Header";
import UploadZone from "@/components/UploadZone";
import TreeView from "@/components/TreeView";
import { useLang } from "@/lib/i18n-context";

interface AnalyzeResult {
  ok: true;
  framework: string;
  buildCommand: string | null;
  fileCount: number;
  tree: any[];
}

export default function NewRepoPage() {
  const { t } = useLang();
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ repoUrl: string } | null>(null);

  function handleAnalyzed(f: File, data: AnalyzeResult) {
    setFile(f);
    setAnalysis(data);
    if (!repoName) {
      setRepoName(f.name.replace(/\.zip$/i, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
    }
  }

  async function handlePush() {
    if (!file || !repoName) return;
    setPushing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "new");
      formData.append("repoName", repoName);
      formData.append("private", String(isPrivate));
      const res = await fetch("/api/push", { method: "POST", body: formData });
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
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-base-border bg-base-bg p-2">
                    <TreeView nodes={analysis.tree} />
                  </div>
                </div>

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
