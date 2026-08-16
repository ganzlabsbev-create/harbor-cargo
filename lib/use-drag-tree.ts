"use client";

import { useCallback, useRef, useState } from "react";
import type { DragGhostHandle } from "@/components/DragGhost";

export interface DragTreeState {
  draggingId: string | null;
  hoverFolder: string | null;
  /** Set once at drag start, for the ghost's first paint position only — never updated on move (see below). */
  startPointer: { x: number; y: number } | null;
}

const EDGE_ZONE = 48; // px from the scroll container's top/bottom edge that triggers auto-scroll
const MAX_SCROLL_SPEED = 14; // px per animation frame right at the edge

const INITIAL_STATE: DragTreeState = { draggingId: null, hoverFolder: null, startPointer: null };

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
 * - `draggingId`/`hoverFolder` drive the dimmed row and the folder
 *   highlight; the floating ghost (DragGhost.tsx) is moved imperatively via
 *   `ghostRef`, not through this state — see the note on `startPointer`
 *   above and DragGhost's own comment. Only genuinely discrete changes
 *   (drag start/end, hover folder actually changing) go through setState,
 *   so the tree doesn't re-render on every pixel of pointer movement.
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
  const pointerRef = useRef({ x: 0, y: 0 });
  const hoverFolderRef = useRef<string | null>(null);
  const ghostRef = useRef<DragGhostHandle | null>(null);

  const startDrag = useCallback(
    (id: string, startX: number, startY: number, rootEl: HTMLElement | null) => {
      scrollElRef.current = findScrollAncestor(rootEl);
      pointerRef.current = { x: startX, y: startY };
      const initialFolder = findFolderAt(startX, startY);
      hoverFolderRef.current = initialFolder;
      setState({ draggingId: id, hoverFolder: initialFolder, startPointer: { x: startX, y: startY } });

      function setHoverFolder(folder: string | null) {
        if (folder === hoverFolderRef.current) return;
        hoverFolderRef.current = folder;
        setState((s) => ({ ...s, hoverFolder: folder }));
      }

      function onPointerMove(e: PointerEvent) {
        pointerRef.current = { x: e.clientX, y: e.clientY };
        ghostRef.current?.move(e.clientX, e.clientY);
        setHoverFolder(findFolderAt(e.clientX, e.clientY));
      }

      function tick() {
        const scrollEl = scrollElRef.current;
        if (stateRef.current.draggingId && scrollEl) {
          const { x, y } = pointerRef.current;
          const rect = scrollEl.getBoundingClientRect();
          const distTop = y - rect.top;
          const distBottom = rect.bottom - y;
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
            setHoverFolder(findFolderAt(x, y));
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
        hoverFolderRef.current = null;
        setState(INITIAL_STATE);
      }

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      rafRef.current = requestAnimationFrame(tick);
    },
    [onDrop]
  );

  return { state, startDrag, ghostRef };
}
