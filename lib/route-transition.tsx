"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface RouteTransitionContextValue {
  /** Call right before a programmatic navigation (router.push) that isn't
   *  already caught by the global <a> click listener below, so the overlay
   *  still shows for it too. See the router.push call sites in
   *  app/settings/page.tsx, app/login/page.tsx,
   *  app/tools/vercel/manage/[projectId]/page.tsx, and
   *  app/tools/preview/page.tsx. */
  start: () => void;
}

const RouteTransitionContext = createContext<RouteTransitionContextValue>({ start: () => {} });

export function useRouteTransition() {
  return useContext(RouteTransitionContext);
}

// Progress trickles toward this cap while navigation is still pending —
// never reaches 100% on its own, since we don't actually know how far
// along a client-side nav is. Only stop() (the route having committed)
// is allowed to complete the bar, so the fill always reflects real state
// instead of a canned animation that loops independently of the page.
const TRICKLE_CAP = 90;
const TRICKLE_INTERVAL_MS = 200;
// After stop() snaps the bar to 100%, hold it there briefly so the "done"
// state is actually visible instead of disappearing mid-frame, then fade
// the whole overlay out.
const COMPLETE_HOLD_MS = 150;
const FADE_MS = 180;
// Failsafe: if the pathname never actually changes (a hash-only href that
// slipped through, a navigation that errors before committing), don't
// leave the user staring at a stuck overlay forever.
const FAILSAFE_MS = 8000;

/**
 * Shows a centered pill + translucent scrim while a client-side route
 * change is in flight. App Router's own loading.tsx only covers routes
 * that opt in (see the handful of loading.tsx files under app/, each
 * rendering components/PageSkeleton.tsx), and even those only paint once
 * the new route has already started rendering — there was nothing at all
 * for the moment right after a tap, which is what read as "changing pages
 * doesn't show any loading state." This covers every internal link and
 * programmatic navigation from the moment the click/push happens, on top
 * of (not instead of) the existing per-route skeletons.
 *
 * Mount once near the root — see app/layout.tsx.
 */
export function RouteTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [progress, setProgress] = useState(0);
  const pendingRef = useRef(false);
  const trickleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (trickleTimerRef.current) clearInterval(trickleTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    trickleTimerRef.current = null;
    hideTimerRef.current = null;
    failsafeRef.current = null;
  }

  function start() {
    clearTimers();
    pendingRef.current = true;
    setClosing(false);
    setVisible(true);
    setProgress(10); // immediate jump so it reads as "started", not stalled
    trickleTimerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= TRICKLE_CAP) return p;
        // Diminishing steps as it approaches the cap — fast at first, then
        // creeps, so it never visibly "finishes" before the route actually
        // commits.
        return Math.min(TRICKLE_CAP, p + (TRICKLE_CAP - p) * 0.15);
      });
    }, TRICKLE_INTERVAL_MS);
    failsafeRef.current = setTimeout(() => {
      pendingRef.current = false;
      finishAndHide();
    }, FAILSAFE_MS);
  }

  // Snaps the bar to 100% (the one point where it's allowed to complete),
  // holds briefly so that's actually visible, then fades the overlay out.
  function finishAndHide() {
    if (trickleTimerRef.current) clearInterval(trickleTimerRef.current);
    trickleTimerRef.current = null;
    setProgress(100);
    hideTimerRef.current = setTimeout(() => {
      setClosing(true);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        setClosing(false);
        setProgress(0);
      }, FADE_MS);
    }, COMPLETE_HOLD_MS);
  }

  function stop() {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = null;
    finishAndHide();
  }

  // The new route has actually committed (or we navigated back to the same
  // one) — hide the overlay (after its minimum visible window). Runs on
  // every pathname change, including the first render, which is harmless
  // since stop() is a no-op when nothing is pending.
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Global capture-phase click listener: catches every internal <a> click
  // — which is how next/link renders, so this covers all 19+ existing
  // Link usages with no need to touch each call site — without
  // intercepting external links, downloads, new-tab, or modified clicks.
  // Also covers browser back/forward via popstate, which never fires a
  // click at all.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.hasAttribute("download") || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return; // same-page (query/hash only)
      start();
    }
    function onPopState() {
      start();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RouteTransitionContext.Provider value={{ start }}>
      {children}
      {visible && (
        <div
          aria-hidden
          className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/10 transition-opacity duration-[180ms] ${
            closing ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="h-1 w-16 overflow-hidden rounded-full bg-white/20 shadow-card">
            <div
              className="h-full rounded-full bg-harbor-mist/90 transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </RouteTransitionContext.Provider>
  );
}
