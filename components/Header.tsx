"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import Logo from "./Logo";
import { useLang } from "@/lib/i18n-context";

export default function Header() {
  const { t } = useLang();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-20 bg-base-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-display text-lg font-bold tracking-tight text-ink">HARBOR CARGO</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            className={`rounded-lg p-2 transition ${
              pathname === "/settings" ? "bg-base-surface2 text-harbor-orange" : "text-ink-dim hover:text-ink"
            }`}
            aria-label={t("nav_settings")}
          >
            <Settings size={20} strokeWidth={1.75} />
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg p-2 text-ink-dim transition hover:text-accent-red"
            aria-label={t("logout")}
          >
            <LogOut size={20} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <div className="harbor-wave h-2.5 w-full" />
    </header>
  );
}
