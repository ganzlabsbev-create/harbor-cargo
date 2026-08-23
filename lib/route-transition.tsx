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

// How far the bar is allowed to creep on its own while a nav is pending —
// it can never reach 100% without stop() actually being called, so the
// fill always reflects real state instead of a canned loop.
const TRICKLE_TARGET = 88;
// Two-stage timing instead of a JS interval: a quick pop-in so the bar
// reads as "started" immediately, then ONE CSS transition toward
// TRICKLE_TARGET. A single continuous transition never stutters the way
// re-triggering a transition every N ms can (each restart is a chance for
// timer jitter to show up as a visible stall) — the browser just eases it
// smoothly regardless of what else the main thread is doing, since it's a
// transform (compositor-only), not a width (which repaints on every step).
// TRICKLE_MS must be tuned to how fast real navigations actually resolve —
// a value that's too long (was 6000ms) means most real navigations finish
// while the bar is still near its start, which read as "barely moves,
// then the page just changes." Most App Router client nav (prefetched
// routes especially) commits well under a second, so the trickle needs to
// be most of the way there within that window, not over several seconds.
const POP_IN_MS = 100;
const TRICKLE_MS = 700;
// stop() means the route has ALREADY committed — the new page is already
// visible underneath the scrim, so there's nothing to gain by holding the
// bar at 100% before starting to dismiss it. Snap + fade start at the same
// time, and both are kept short so the overlay is gone within ~150ms of
// the route committing instead of visibly lingering over it.
const COMPLETE_MS = 70;
const FADE_MS = 110;
// Failsafe: if the pathname never actually changes (a hash-only href that
// slipped through, a navigation that errors before committing), don't
// leave the user staring at a stuck overlay forever.
const FAILSAFE_MS = 8000;

type Phase = "starting" | "trickling" | "completing";

const PHASE_TRANSITION: Record<Phase, string> = {
  starting: `transform ${POP_IN_MS}ms ease-out`,
  trickling: `transform ${TRICKLE_MS}ms cubic-bezier(0.05, 0.85, 0.15, 1)`,
  completing: `transform ${COMPLETE_MS}ms ease-out`,
};

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
  const [phase, setPhase] = useState<Phase>("starting");
  const pendingRef = useRef(false);
  // Bumped on every start(). Timers from a superseded navigation compare
  // their captured id against this and bail if they no longer match,
  // instead of applying stale state on top of whatever the newest
  // navigation is doing — this is what was causing the occasional stuck
  // bar when a second link got tapped before the first one's timers had
  // finished running.
  const navIdRef = useRef(0);
  const trickleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (trickleTimerRef.current) clearTimeout(trickleTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    trickleTimerRef.current = null;
    hideTimerRef.current = null;
    failsafeRef.current = null;
  }

  function start() {
    clearTimers();
    const id = ++navIdRef.current;
    pendingRef.current = true;
    setClosing(false);
    setVisible(true);
    setPhase("starting");
    setProgress(32); // immediate pop so it reads as "started", not a stray dot

    trickleTimerRef.current = setTimeout(() => {
      if (navIdRef.current !== id) return; // superseded by a newer nav
      setPhase("trickling");
      setProgress(TRICKLE_TARGET);
    }, POP_IN_MS);

    failsafeRef.current = setTimeout(() => {
      if (navIdRef.current !== id) return;
      pendingRef.current = false;
      finishAndHide(id);
    }, FAILSAFE_MS);
  }

  // Snaps the bar to 100% and starts fading the whole overlay out in the
  // same tick — the route has already committed by the time this runs, so
  // there's nothing to wait on. Re-checks navIdRef so a delayed timer from
  // a since-replaced navigation can never stomp on a newer one's state.
  function finishAndHide(id: number) {
    if (trickleTimerRef.current) clearTimeout(trickleTimerRef.current);
    trickleTimerRef.current = null;
    setPhase("completing");
    setProgress(100);
    setClosing(true);
    hideTimerRef.current = setTimeout(() => {
      if (navIdRef.current !== id) return;
      setVisible(false);
      setClosing(false);
      setProgress(0);
    }, FADE_MS);
  }

  function stop() {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = null;
    finishAndHide(navIdRef.current);
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
          className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/20 transition-opacity duration-[110ms] ${
            closing ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10 shadow-card">
            <div
              className="h-full w-full origin-left rounded-full bg-harbor-mist/90"
              style={{ transform: `scaleX(${progress / 100})`, transition: PHASE_TRANSITION[phase] }}
            />
          </div>
        </div>
      )}
    </RouteTransitionContext.Provider>
  );
}
