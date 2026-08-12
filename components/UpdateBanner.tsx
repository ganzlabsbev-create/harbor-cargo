"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLang } from "@/lib/i18n-context";

/**
 * Polls /api/version and compares against the build id baked into the
 * client bundle. Shows a small dismissible banner rather than forcing a
 * reload, since the user might be mid-form. See build spec section 6.
 */
export default function UpdateBanner() {
  const { t } = useLang();
  const [updateAvailable, setUpdateAvailable] = useState(false);

  async function check() {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const data = await res.json();
      if (data.buildId && data.buildId !== process.env.NEXT_PUBLIC_BUILD_ID) {
        setUpdateAvailable(true);
      }
    } catch {
      // ignore transient network errors
    }
  }

  useEffect(() => {
    check();
    const interval = setInterval(check, 3 * 60 * 1000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  function reload() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    }
    window.location.reload();
  }

  if (!updateAvailable) return null;

  return (
    <button
      onClick={reload}
      className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-harbor-orange px-4 py-2.5 text-sm font-medium text-white shadow-glow-orange"
    >
      <RefreshCw size={16} strokeWidth={2} />
      {t("update_available")}
    </button>
  );
}
