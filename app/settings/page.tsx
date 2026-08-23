"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  LogOut,
  RefreshCw,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  BookOpen,
  Tag,
  ScrollText,
  ShieldCheck,
  Github,
  User as UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import LanguageToggle from "@/components/LanguageToggle";
import { useLang } from "@/lib/i18n-context";
import { useSession } from "@/lib/use-session";
import { useRouteTransition } from "@/lib/route-transition";
import { APP_VERSION } from "@/lib/version";

export default function SettingsPage() {
  const { t } = useLang();
  const router = useRouter();
  const { start: startRouteTransition } = useRouteTransition();
  const { user, loading } = useSession();
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<"latest" | "update" | null>(null);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Guests can keep using Harbor Cargo, so logout returns home instead
    // of forcing another trip through /login.
    startRouteTransition();
    router.push("/");
    router.refresh();
  }

  async function checkVersion() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const data = await res.json();
      setCheckResult(data.buildId !== process.env.NEXT_PUBLIC_BUILD_ID ? "update" : "latest");
    } finally {
      setChecking(false);
    }
  }

  const aboutLinks = [
    { href: "/settings/about", icon: Info, title: t("about_app_title"), desc: t("about_app_desc") },
    { href: "/settings/help", icon: BookOpen, title: t("how_to_use_title"), desc: t("how_to_use_desc") },
    { href: "/settings/version", icon: Tag, title: t("version_title"), desc: t("version_desc") },
    { href: "/settings/license", icon: ScrollText, title: t("license_title"), desc: t("license_desc") },
    { href: "/settings/privacy", icon: ShieldCheck, title: t("privacy_title"), desc: t("privacy_desc") },
  ];

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("settings_title")}</h1>

        <section className="mt-5 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">{t("settings_account")}</h2>
          {loading ? (
            <div className="mt-3 flex items-center gap-3 text-sm text-ink-dim">
              <Loader2 size={16} className="animate-spin" /> {t("checking_session")}
            </div>
          ) : user ? (
            <div className="mt-3 flex items-center gap-3">
              <Image
                src={user.avatarUrl}
                alt={user.login}
                width={44}
                height={44}
                className="rounded-full border border-base-border"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">{user.login}</p>
                <p className="text-xs text-ink-faint">{t("settings_logout_desc")}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-2 text-sm text-accent-red"
              >
                <LogOut size={16} /> {t("logout")}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-ink-dim">
                <UserIcon size={20} strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-ink">{t("settings_guest_label")}</p>
                <p className="text-xs text-ink-faint">{t("settings_guest_desc")}</p>
              </div>
              <a
                href={`/api/auth/github?next=${encodeURIComponent("/settings")}`}
                className="flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-2 text-sm text-ink"
              >
                <Github size={16} /> {t("login_with_github_button")}
              </a>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">{t("settings_language")}</h2>
          <div className="mt-3">
            <LanguageToggle />
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">{t("settings_updates")}</h2>
          <button
            onClick={checkVersion}
            disabled={checking}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-base-border px-4 py-3 text-sm font-medium text-ink"
          >
            {checking ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t("checking_update")}
              </>
            ) : (
              <>
                <RefreshCw size={16} /> {t("check_update_button")}
              </>
            )}
          </button>
          {checkResult === "latest" && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-accent-green">
              <CheckCircle2 size={14} /> {t("up_to_date")}
            </p>
          )}
          {checkResult === "update" && (
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-sm font-medium text-harbor-orange"
            >
              {t("update_available")} — {t("update_reload")}
            </button>
          )}
        </section>

        <section className="mt-4">
          <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
            {t("settings_about_section")}
          </h2>
          <div className="flex flex-col gap-2">
            {aboutLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card transition active:scale-[0.99]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-base-surface2 text-ink-dim">
                  <link.icon size={18} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{link.title}</p>
                  <p className="truncate text-xs text-ink-faint">{link.desc}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-ink-faint" />
              </Link>
            ))}
          </div>
          <p className="mt-3 px-1 text-center text-xs text-ink-faint">HARBOR CARGO v{APP_VERSION}</p>
        </section>
      </div>
    </main>
  );
}
