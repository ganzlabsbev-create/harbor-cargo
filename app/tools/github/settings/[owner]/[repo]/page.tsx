"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Settings2, AlertTriangle } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import { useLang } from "@/lib/i18n-context";

/**
 * GitHub Settings index (build spec section 2). Pure navigation, not a
 * long form — each category is its own route/page so mobile gets a short
 * list of tappable cards instead of one giant accordion (spec sections 2
 * and 15).
 *
 * Only categories with a real API implementation behind them are listed —
 * Branches/Actions/Variables/Access aren't wired up yet in this pass (no
 * existing Harbor abstraction to reuse for them), so they're left out
 * rather than shown as dead links or fake controls (spec section 4/18).
 */
export default function GithubSettingsIndex({ params }: { params: { owner: string; repo: string } }) {
  const { t } = useLang();
  const { owner, repo } = params;
  const base = `/tools/github/settings/${owner}/${repo}`;

  const categories = [
    { href: `${base}/repository`, icon: Settings2, title: t("gh_settings_repository"), desc: t("gh_settings_repository_desc") },
  ];

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/tools/github/update" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <AuthGate next={base}>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("gh_settings_title")}</h1>
          <p className="mt-1 text-sm text-ink-faint">{owner}/{repo}</p>

          <div className="mt-5 flex flex-col gap-2">
            {categories.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="flex items-center gap-3 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card transition active:scale-[0.99]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-base-surface2 text-ink-dim">
                  <c.icon size={18} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{c.title}</p>
                  <p className="truncate text-xs text-ink-faint">{c.desc}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-ink-faint" />
              </Link>
            ))}
          </div>

          <div className="mt-6">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-accent-red">{t("gh_settings_danger_zone")}</p>
            <Link
              href={`${base}/danger`}
              className="flex items-center gap-3 rounded-2xl border border-accent-red/30 bg-accent-red/5 p-4 shadow-card transition active:scale-[0.99]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-red/10 text-accent-red">
                <AlertTriangle size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t("gh_settings_danger_zone")}</p>
                <p className="truncate text-xs text-ink-faint">{t("gh_settings_danger_zone_desc")}</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-accent-red" />
            </Link>
          </div>
        </AuthGate>
      </div>
    </main>
  );
}
