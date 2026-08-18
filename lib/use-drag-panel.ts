// lib/use-drag-panel.ts
//
// Drag-to-resize behaviour for Captain Harbor's chat panel (see
// components/CaptainHarbor.tsx). Only the grab handle (a small bar) is a
// drag target — everything else in the panel is normal scrollable content,
// so there's no gesture conflict to resolve between "scroll the chat" and
// "resize the panel"; they're just different elements.
//
// The panel has three open positions, expressed as a CSS `top` offset from
// the viewport (a smaller offset = taller panel):
//   full      -> near the top of the screen (handle still visible above it)
//   half      -> roughly mid-screen
//   collapsed -> just tall enough for the handle + one status line
// "closed" isn't reachable by dragging — only the explicit close button
// sets it — so it's excluded from the drag geometry entirely.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PanelState } from "./captain-harbor/types";

const FULL_TOP_VH = 8; // leaves 8vh above the panel so the handle reads as "grabbable"
const HALF_TOP_VH = 46;
const COLLAPSED_TOP_VH = 100; // set precisely below, in px, via COLLAPSED_HEIGHT_PX
const COLLAPSED_HEIGHT_PX = 76;

// A fast, short flick shouldn't have to travel all the way to the nearest
// resting position before it snaps there — see onHandlePointerUp below.
// Expressed as px/ms; ~0.5 is a brisk (but not extreme) flick on a phone.
const FLICK_VELOCITY_THRESHOLD = 0.5;

function topPxFor(state: PanelState, viewportH: number): number {
  if (state === "full") return (FULL_TOP_VH / 100) * viewportH;
  if (state === "half") return (HALF_TOP_VH / 100) * viewportH;
  return Math.max(0, viewportH - COLLAPSED_HEIGHT_PX);
}

export function useDragPanel(initial: PanelState = "closed") {
  const [panelState, setPanelState] = useState<PanelState>(initial);
  const [dragTopPx, setDragTopPx] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const dragInfo = useRef<{ startY: number; startTop: number } | null>(null);
  // Last two (timestamp, clientY) samples from onHandlePointerMove, used to
  // compute a release velocity in onHandlePointerUp. Only the last two are
  // ever needed for a simple instantaneous-velocity estimate.
  const velocityInfo = useRef<{ t: number; y: number }[]>([]);

  const open = useCallback((to: PanelState = "full") => setPanelState(to), []);
  const close = useCallback(() => {
    setPanelState("closed");
    setDragTopPx(null);
  }, []);

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (panelState === "closed") return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const vh = window.innerHeight;
      dragInfo.current = { startY: e.clientY, startTop: topPxFor(panelState, vh) };
      velocityInfo.current = [{ t: e.timeStamp, y: e.clientY }];
      setPressed(true);
    },
    [panelState]
  );

  const onHandlePointerMove = useCallback((e: ReactPointerEvent) => {
    if (!dragInfo.current) return;
    const vh = window.innerHeight;
    const delta = e.clientY - dragInfo.current.startY;
    const minTop = (FULL_TOP_VH / 100) * vh;
    const maxTop = Math.max(0, vh - COLLAPSED_HEIGHT_PX);
    const next = Math.min(maxTop, Math.max(minTop, dragInfo.current.startTop + delta));
    setDragTopPx(next);
    // Keep only the last two samples — that's all a instantaneous-velocity
    // estimate at release needs, and it keeps this cheap on every move event.
    velocityInfo.current = [...velocityInfo.current.slice(-1), { t: e.timeStamp, y: e.clientY }];
  }, []);

  const onHandlePointerUp = useCallback((e: ReactPointerEvent) => {
    if (!dragInfo.current) return;
    const vh = window.innerHeight;
    const finalTop = dragTopPx ?? topPxFor(panelState, vh);

    // Velocity-based snap: a short, fast flick should snap in the flick
    // direction even if the release position is still closer (by raw
    // distance) to where the drag started than to the next resting spot.
    const samples = velocityInfo.current;
    let flickState: PanelState | null = null;
    if (samples.length === 2) {
      const [a, b] = samples;
      const dt = b.t - a.t;
      const dy = b.y - a.y;
      const velocity = dt > 0 ? dy / dt : 0; // px/ms, positive = moving down
      if (Math.abs(velocity) >= FLICK_VELOCITY_THRESHOLD) {
        const order: PanelState[] = ["full", "half", "collapsed"];
        const currentIndex = order.indexOf(panelState);
        // Moving down (+) = toward "collapsed"; moving up (-) = toward "full".
        const targetIndex = velocity > 0
          ? Math.min(order.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
        flickState = order[targetIndex];
      }
    }

    let nextState: PanelState;
    if (flickState) {
      nextState = flickState;
    } else {
      const candidates: { state: PanelState; top: number }[] = [
        { state: "full", top: topPxFor("full", vh) },
        { state: "half", top: topPxFor("half", vh) },
        { state: "collapsed", top: topPxFor("collapsed", vh) },
      ];
      let nearest = candidates[0];
      let nearestDist = Infinity;
      for (const c of candidates) {
        const d = Math.abs(c.top - finalTop);
        if (d < nearestDist) {
          nearest = c;
          nearestDist = d;
        }
      }
      nextState = nearest.state;
    }

    setPanelState(nextState);
    setDragTopPx(null);
    dragInfo.current = null;
    velocityInfo.current = [];
    setPressed(false);
  }, [dragTopPx, panelState]);

  // Native/webview back-button handling (P1 #8): while the panel is open,
  // treat one back-press as "collapse the panel" instead of letting the
  // browser/webview navigate away or close the app. We push a dummy history
  // entry the moment the panel opens (closed -> anything else) so there's
  // always one to intercept; each popstate we catch re-pushes another one,
  // so repeated back-presses keep collapsing rather than escaping after the
  // first press only. Once the panel is actually closed, no entry is pushed
  // and back behaves normally again.
  const panelStateRef = useRef(panelState);
  panelStateRef.current = panelState;
  const wasClosedRef = useRef(panelState === "closed");

  useEffect(() => {
    const wasClosed = wasClosedRef.current;
    const isClosed = panelState === "closed";
    if (wasClosed && !isClosed && typeof window !== "undefined") {
      try {
        window.history.pushState({ harborPanel: true }, "");
      } catch {
        // pushState can throw under some webview security policies — the
        // panel still works fine, it just won't intercept the back button.
      }
    }
    wasClosedRef.current = isClosed;
  }, [panelState]);

  useEffect(() => {
    function onPopState() {
      if (panelStateRef.current === "closed") return;
      setPanelState("collapsed");
      setDragTopPx(null);
      try {
        window.history.pushState({ harborPanel: true }, "");
      } catch {
        // see note above
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /** Tapping (not dragging) the handle while collapsed re-opens to half. */
  const onHandleClick = useCallback(() => {
    if (panelState === "collapsed") setPanelState("half");
  }, [panelState]);

  const topStyle =
    panelState === "closed"
      ? undefined
      : dragTopPx != null
        ? `${dragTopPx}px`
        : `${topPxFor(panelState, typeof window !== "undefined" ? window.innerHeight : 800)}px`;

  return {
    panelState,
    setPanelState,
    open,
    close,
    pressed,
    dragging: dragTopPx != null,
    topStyle,
    handlers: {
      onPointerDown: onHandlePointerDown,
      onPointerMove: onHandlePointerMove,
      onPointerUp: onHandlePointerUp,
      onPointerCancel: onHandlePointerUp,
      onClick: onHandleClick,
    },
  };
}
