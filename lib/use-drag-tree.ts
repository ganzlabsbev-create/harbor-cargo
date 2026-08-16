"use client";

import { useCallback, useRef, useState } from "react";

export interface DragTreeState {
  draggingId: string | null;
  hoverFolder: string | null;
  pointer: { x: number; y: number } | null;
}

const EDGE_ZONE = 48; // px from the scroll container's top/bottom edge that triggers auto-scroll
const MAX_SCROLL_SPEED = 14; // px per animation frame right at the edge

const INITIAL_STATE: DragTreeState = { draggingId: null, hoverFolder: null, pointer: null };

function findFolderAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const row = el?.closest("[data-drop-folder]") as HTMLElement | null;
  return row ? row.getAttribute("data-drop-folder") : null;
}

/** Walks up from `el` to find the nearest ancestor that actually scrolls. */
function findScrollAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    if (canScrollY) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Drag-to-move-into-folder for a file tree, shared by EditableTreeView (new
 * repo) and DiffTreeView (update repo) so both behave identically:
 * - `draggingId`/`hoverFolder`/`pointer` drive the dimmed row, the folder
 *   highlight, and a floating ghost that follows the pointer (see
 *   DragGhost.tsx) — without the ghost, dragging past the visible list edge
 *   had nothing to show it was still active.
 * - While the pointer sits near the top/bottom edge of the tree's scroll
 *   container, this auto-scrolls that container so long lists can be
 *   reached without the drag getting stuck at the viewport boundary.
 */
export function useDragTree(onDrop: (id: string, targetFolder: string) => void) {
  const [state, setState] = useState<DragTreeState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const scrollElRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const startDrag = useCallback(
    (id: string, startX: number, startY: number, rootEl: HTMLElement | null) => {
      scrollElRef.current = findScrollAncestor(rootEl);
      setState({ draggingId: id, hoverFolder: findFolderAt(startX, startY), pointer: { x: startX, y: startY } });

      function onPointerMove(e: PointerEvent) {
        setState((s) => ({ ...s, hoverFolder: findFolderAt(e.clientX, e.clientY), pointer: { x: e.clientX, y: e.clientY } }));
      }

      function tick() {
        const s = stateRef.current;
        const scrollEl = scrollElRef.current;
        if (s.draggingId && s.pointer && scrollEl) {
          const rect = scrollEl.getBoundingClientRect();
          const distTop = s.pointer.y - rect.top;
          const distBottom = rect.bottom - s.pointer.y;
          let dy = 0;
          if (distTop >= 0 && distTop < EDGE_ZONE) {
            dy = -MAX_SCROLL_SPEED * ((EDGE_ZONE - distTop) / EDGE_ZONE);
          } else if (distBottom >= 0 && distBottom < EDGE_ZONE) {
            dy = MAX_SCROLL_SPEED * ((EDGE_ZONE - distBottom) / EDGE_ZONE);
          }
          if (dy !== 0) {
            scrollEl.scrollTop += dy;
            // The pointer hasn't moved but the content under it just did —
            // recheck what's there so the hover highlight stays accurate.
            const folder = findFolderAt(s.pointer.x, s.pointer.y);
            if (folder !== s.hoverFolder) setState((prev) => ({ ...prev, hoverFolder: folder }));
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      }

      function onPointerUp(e: PointerEvent) {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        const folder = findFolderAt(e.clientX, e.clientY);
        const dragging = stateRef.current.draggingId;
        if (dragging && folder !== null) onDrop(dragging, folder);
        setState(INITIAL_STATE);
      }

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      rafRef.current = requestAnimationFrame(tick);
    },
    [onDrop]
  );

  return { state, startDrag };
}
