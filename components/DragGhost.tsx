"use client";

import { File as FileIcon } from "lucide-react";

export default function DragGhost({ x, y, name }: { x: number; y: number; name: string }) {
  return (
    <div
      className="pointer-events-none fixed z-50 flex max-w-[70vw] items-center gap-1.5 rounded-lg border border-harbor-orange bg-base-surface px-2.5 py-1.5 font-mono text-xs text-ink shadow-glow-orange"
      style={{ left: x, top: y, transform: "translate(-50%, -130%)" }}
    >
      <FileIcon size={13} strokeWidth={2} className="shrink-0 text-harbor-orange" />
      <span className="truncate">{name}</span>
    </div>
  );
}
