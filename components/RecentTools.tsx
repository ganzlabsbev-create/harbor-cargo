"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GithubMark, VercelMark } from "./BrandIcons";
import { useLang } from "@/lib/i18n-context";
import { getRecents, RecentTool } from "@/lib/recents";

function relativeTime(ts: number, lang: string): string {
  const diffMs = ts - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === "th" ? "th-TH" : "en-US", { numeric: "auto" });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, "day");
}

function iconFor(type: RecentTool["type"]) {
  if (type === "github-update") return <GithubMark size={16} />;
  return <VercelMark size={16} />;
}

/**
 * Quick-jump row for the home page — up to 5 recently used repo/project
 * selections, tapping one deep-links straight past the picker step (see
 * lib/recents.ts for why this is localStorage-only, never server-side).
 * Renders nothing until recents are read on mount, and nothing at all if
 * the list is empty — no empty-state placeholder to avoid clutter.
 */
export default function RecentTools() {
  const { t, lang } = useLang();
  const [recents, setRecents] = useState<RecentTool[] | null>(null);

  useEffect(() => {
    setRecents(getRecents());
  }, []);

  if (!recents || recents.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="mb-2 px-1 text-[11px] uppercase tracking-wide text-ink-faint">{t("recent_title")}</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {recents.map((r) => (
          <Link
            key={r.id}
            href={r.href}
            className="flex shrink-0 items-center gap-2.5 rounded-xl border border-base-border bg-base-surface px-3 py-2.5 shadow-card transition active:scale-[0.98]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-surface2 text-ink-dim">
              {iconFor(r.type)}
            </div>
            <div className="min-w-0">
              <p className="max-w-[9rem] truncate text-xs font-medium text-ink">{r.label}</p>
              <p className="max-w-[9rem] truncate text-[11px] text-ink-faint">
                {r.sublabel ? `${r.sublabel} · ` : ""}
                {relativeTime(r.ts, lang)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
