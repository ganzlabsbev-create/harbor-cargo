"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, User, Github, LogOut, ExternalLink } from "lucide-react";
import Logo from "./Logo";
import { useLang } from "@/lib/i18n-context";
import { useSession } from "@/lib/use-session";

export default function Header() {
  const { t } = useLang();
  const pathname = usePathname();
  const { user, loading } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    // Move focus into the menu so keyboard users don't have to tab past
    // the trigger again to reach it.
    firstMenuItemRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    // Guests can keep using the app — no more bouncing to /login.
    window.location.href = "/";
  }

  const loginHref = `/api/auth/github?next=${encodeURIComponent(pathname || "/")}`;

  return (
    <header className="sticky top-0 z-20 bg-base-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
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

          <div className="relative" ref={menuRef}>
            <button
              ref={menuButtonRef}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t("nav_account")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-ink-dim transition hover:text-ink"
            >
              {/* Reserve the same slot whether loading, guest, or logged
                  in — this is what stops the Home -> Login -> Home
                  flicker: the icon only ever swaps in place, it never
                  changes layout or briefly disappears. */}
              {!loading && user && !avatarFailed ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.login}
                  width={36}
                  height={36}
                  className="h-full w-full rounded-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : !loading && user && avatarFailed ? (
                // Avatar URL failed to load — fall back to the GitHub
                // mark instead of a broken image icon.
                <Github size={18} strokeWidth={1.75} />
              ) : (
                <User size={18} strokeWidth={1.75} className={loading ? "opacity-40" : ""} />
              )}
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label={t("nav_account")}
                className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card"
              >
                {user ? (
                  <>
                    <div className="border-b border-base-border px-4 py-3">
                      <p className="truncate text-sm font-medium text-ink">{user.login}</p>
                      <p className="text-xs text-ink-faint">{t("nav_account_github")}</p>
                    </div>
                    <a
                      ref={(el) => { firstMenuItemRef.current = el; }}
                      role="menuitem"
                      href={`https://github.com/${user.login}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-ink-dim transition hover:bg-base-surface2 hover:text-ink"
                    >
                      <Github size={16} /> {t("nav_account_github")}
                      <ExternalLink size={12} className="ml-auto text-ink-faint" />
                    </a>
                    <button
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-accent-red transition hover:bg-base-surface2"
                    >
                      <LogOut size={16} /> {t("logout")}
                    </button>
                  </>
                ) : (
                  <a
                    ref={(el) => { firstMenuItemRef.current = el; }}
                    role="menuitem"
                    href={loginHref}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-ink transition hover:bg-base-surface2"
                  >
                    <Github size={16} /> {t("login_with_github_button")}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="harbor-wave h-2.5 w-full" />
    </header>
  );
}
