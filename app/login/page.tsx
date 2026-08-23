"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, X } from "lucide-react";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useLang } from "@/lib/i18n-context";
import { safeReturnPath } from "@/lib/return-path";

function LoginPageInner() {
  const { t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeReturnPath(searchParams.get("next"));
  const githubHref = next ? `/api/auth/github?next=${encodeURIComponent(next)}` : "/api/auth/github";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-harbor-hull px-6">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      {/* Guests can always back out to where they came from (or home) —
          this "/login" route no longer sits behind a forced redirect, so
          there's no reason to trap anyone here. */}
      <button
        onClick={() => router.push(next || "/")}
        aria-label={t("back")}
        className="absolute left-4 top-4 rounded-lg p-2 text-ink-dim transition hover:text-ink"
      >
        <X size={20} strokeWidth={1.75} />
      </button>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Logo size={88} />
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">{t("login_title")}</h1>
        <p className="mt-2 text-sm text-ink-dim">{t("login_desc")}</p>

        <a
          href={githubHref}
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
