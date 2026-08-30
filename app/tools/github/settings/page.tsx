"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import RepoIcon from "@/components/RepoIcon";
import { useLang } from "@/lib/i18n-context";

interface RepoOption {
  name: string;
  full_name: string;
  default_branch: string;
  updated_at: string;
  language?: string | null;
  logoUrl?: string | null;
}

/**
 * GitHub Settings entry point — the card on /tools/github links here first
 * (pick a repo), then on to /tools/github/settings/[owner]/[repo] (the
 * category index) once one is chosen. Same repo list + /api/repos call
 * app/tools/github/update/page.tsx already uses.
 */
export default function GithubSettingsRepoPicker() {
  const { t } = useLang();
  const router = useRouter();
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/repos")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "load_failed");
        setRepos(data.repos);
      })
      .catch((err) => setLoadError(String(err?.message || err)));
  }, []);

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/tools/github" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <AuthGate next="/tools/github/settings">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("gh_settings_title")}</h1>

          <div className="mt-5 flex flex-col gap-3">
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
                {repos.map((r) => {
                  const [owner, repo] = r.full_name.split("/");
                  return (
                    <button
                      key={r.full_name}
                      onClick={() => router.push(`/tools/github/settings/${owner}/${repo}`)}
                      className="flex items-center gap-3 rounded-xl border border-base-border bg-base-surface px-4 py-3 text-left text-sm text-ink transition active:scale-[0.99]"
                    >
                      <RepoIcon logoUrl={r.logoUrl} language={r.language} />
                      <span className="min-w-0 flex-1 truncate font-medium">{r.full_name}</span>
                      <span className="shrink-0 text-xs text-ink-faint">{r.default_branch}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </AuthGate>
      </div>
    </main>
  );
}
