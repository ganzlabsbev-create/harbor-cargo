"use client";

import Link from "next/link";
import { ChevronLeft, Tag } from "lucide-react";
import Header from "@/components/Header";
import { useLang } from "@/lib/i18n-context";
import { APP_VERSION, CHANGELOG } from "@/lib/version";

export default function VersionPage() {
  const { t } = useLang();

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <div className="flex items-center gap-3 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-harbor-orange/15 text-harbor-orange">
            <Tag size={20} />
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-ink">v{APP_VERSION}</p>
            <p className="text-xs text-ink-faint">{t("version_title")}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {CHANGELOG.map((entry) => (
            <section key={entry.version} className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="font-display text-sm font-semibold text-ink">v{entry.version}</p>
                <p className="text-xs text-ink-faint">{entry.date}</p>
              </div>
              <ul className="flex flex-col gap-1.5">
                {entry.notes.map((note, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-dim">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
                    {note}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
