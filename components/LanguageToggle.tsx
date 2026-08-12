"use client";

import { useLang } from "@/lib/i18n-context";

export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="inline-flex rounded-lg border border-base-border bg-base-surface2 p-1">
      {(["th", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition ${
            lang === l ? "bg-harbor-blue text-white" : "text-ink-dim"
          }`}
        >
          {l === "th" ? "ไทย" : "EN"}
        </button>
      ))}
    </div>
  );
}
