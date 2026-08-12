"use client";

import { useLang } from "@/lib/i18n-context";

export default function HomeIntro() {
  const { t } = useLang();
  return (
    <div>
      <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("home_title")}</h1>
      <p className="mt-1 text-sm text-ink-dim">{t("home_desc")}</p>
    </div>
  );
}
