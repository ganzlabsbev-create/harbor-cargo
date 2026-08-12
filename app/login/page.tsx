"use client";

import { Github } from "lucide-react";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useLang } from "@/lib/i18n-context";

export default function LoginPage() {
  const { t } = useLang();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-harbor-hull px-6">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Logo size={88} />
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">{t("login_title")}</h1>
        <p className="mt-2 text-sm text-ink-dim">{t("login_desc")}</p>

        <a
          href="/api/auth/github"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3.5 font-display text-base font-semibold text-harbor-navyDeep shadow-card transition active:scale-[0.98]"
        >
          <Github size={20} strokeWidth={2} />
          {t("login_button")}
        </a>

        <p className="mt-4 text-xs text-ink-faint">{t("login_note")}</p>
      </div>
      <div className="harbor-wave absolute bottom-0 h-2.5 w-full opacity-90" style={{ backgroundPosition: "bottom" }} />
    </main>
  );
}
