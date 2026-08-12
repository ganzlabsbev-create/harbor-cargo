"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LogOut, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import LanguageToggle from "@/components/LanguageToggle";
import { useLang } from "@/lib/i18n-context";

export default function SettingsPage() {
  const { t } = useLang();
  const router = useRouter();
  const [user, setUser] = useState<{ login: string; avatarUrl: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<"latest" | "update" | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => data.ok && setUser(data.user))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
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

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("settings_title")}</h1>

        <section className="mt-5 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">{t("settings_account")}</h2>
          {user && (
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
      </div>
    </main>
  );
}
