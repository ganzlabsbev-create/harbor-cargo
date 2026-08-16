"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { File as FileIcon } from "lucide-react";

export interface DragGhostHandle {
  move: (x: number, y: number) => void;
}

/**
 * Floating chip that follows the pointer while dragging a file. Position
 * updates go straight to the DOM (see `move`, called from
 * lib/use-drag-tree.ts on every pointermove) instead of through React state
 * — routing every pixel of movement through setState used to force the
 * whole file tree to re-render dozens of times a second, which is what
 * caused the visible stutter. This way React only re-renders on the rare,
 * discrete changes (drag start/end, hover folder change); the ghost itself
 * moves as a plain DOM write, independent of React's render cycle.
 */
const DragGhost = forwardRef<DragGhostHandle, { x: number; y: number; name: string }>(function DragGhost(
  { x, y, name },
  ref
) {
  const elRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      move(nx: number, ny: number) {
        const el = elRef.current;
        if (el) {
          el.style.left = `${nx}px`;
          el.style.top = `${ny}px`;
        }
      },
    }),
    []
  );

  return (
    <div
      ref={elRef}
      className="pointer-events-none fixed z-50 flex max-w-[70vw] items-center gap-1.5 rounded-lg border border-harbor-orange bg-base-surface px-2.5 py-1.5 font-mono text-xs text-ink shadow-glow-orange"
      style={{ left: x, top: y, transform: "translate(-50%, -130%)" }}
    >
      <FileIcon size={13} strokeWidth={2} className="shrink-0 text-harbor-orange" />
      <span className="truncate">{name}</span>
    </div>
  );
});

export default DragGhost;
