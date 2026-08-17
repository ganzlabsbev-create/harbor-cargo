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

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PanelState } from "./captain-harbor/types";

const FULL_TOP_VH = 8; // leaves 8vh above the panel so the handle reads as "grabbable"
const HALF_TOP_VH = 46;
const COLLAPSED_TOP_VH = 100; // set precisely below, in px, via COLLAPSED_HEIGHT_PX
const COLLAPSED_HEIGHT_PX = 76;

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
  }, []);

  const onHandlePointerUp = useCallback((e: ReactPointerEvent) => {
    if (!dragInfo.current) return;
    const vh = window.innerHeight;
    const finalTop = dragTopPx ?? topPxFor(panelState, vh);
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
    setPanelState(nearest.state);
    setDragTopPx(null);
    dragInfo.current = null;
    setPressed(false);
  }, [dragTopPx, panelState]);

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
