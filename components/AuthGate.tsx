"use client";

import { Github, Loader2, Lock } from "lucide-react";
import { useSession } from "@/lib/use-session";
import { useLang } from "@/lib/i18n-context";

/**
 * Wraps a protected tool's content area (GitHub new/update, Vercel
 * new/manage). Guests reach the page itself just fine — the URL bar, back
 * link, and Header all render normally — but the operational content is
 * replaced with a centered "sign in required" card instead of the real
 * upload/push UI. No redirect happens on load.
 *
 * `next` is the path to return to after a successful login — passed through
 * to /api/auth/github?next=... and round-tripped via the OAuth state cookie
 * (see app/api/auth/github/route.ts and .../callback/route.ts).
 */
export default function AuthGate({ children, next }: { children: React.ReactNode; next: string }) {
  const { user, loading } = useSession();
  const { t } = useLang();

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-base-border bg-base-surface p-8 text-sm text-ink-dim shadow-card">
        <Loader2 size={18} className="animate-spin" /> {t("checking_session")}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-8 text-center shadow-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-harbor-blue to-harbor-navy text-white shadow-glow-blue">
          <Lock size={22} strokeWidth={1.75} />
        </div>
        <p className="font-display text-base font-semibold text-ink">{t("tool_login_required_title")}</p>
        <p className="text-sm text-ink-dim">{t("tool_login_required_desc")}</p>
        <a
          href={`/api/auth/github?next=${encodeURIComponent(next)}`}
          className="flex items-center gap-2 rounded-xl bg-ink px-5 py-3 font-medium text-harbor-navyDeep shadow-card active:scale-[0.98]"
        >
          <Github size={18} strokeWidth={2} /> {t("login_with_github_button")}
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
