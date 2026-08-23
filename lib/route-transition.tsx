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

// Once shown, keep the overlay up for at least this long — App Router's
// client-side navigation is often faster than a show-delay could ever
// safely be (especially for a route Next already prefetched), so a
// "wait N ms before showing, in case it's slow" approach never actually
// shows anything: the page finishes and stop() fires first every time.
// Showing immediately and enforcing a floor on visible duration instead
// means every navigation gets a visible, non-flickery flash regardless of
// how fast it resolves.
const MIN_VISIBLE_MS = 260;
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
  const pendingRef = useRef(false);
  const shownAtRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    hideTimerRef.current = null;
    failsafeRef.current = null;
  }

  function start() {
    clearTimers();
    pendingRef.current = true;
    shownAtRef.current = Date.now();
    setVisible(true);
    failsafeRef.current = setTimeout(() => {
      pendingRef.current = false;
      setVisible(false);
    }, FAILSAFE_MS);
  }

  function stop() {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = null;
    const remaining = MIN_VISIBLE_MS - (Date.now() - shownAtRef.current);
    if (remaining > 0) {
      hideTimerRef.current = setTimeout(() => setVisible(false), remaining);
    } else {
      setVisible(false);
    }
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
        >
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/15 shadow-card">
            <div className="h-full w-1/3 animate-route-loading rounded-full bg-harbor-mist/90" />
          </div>
        </div>
      )}
    </RouteTransitionContext.Provider>
  );
}
