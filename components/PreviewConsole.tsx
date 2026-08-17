"use client";

import type { ConsoleLine } from "./PreviewFrame";

const LEVEL_COLOR: Record<ConsoleLine["level"], string> = {
  log: "text-ink-dim",
  info: "text-harbor-blue",
  warn: "text-amber-500",
  error: "text-accent-red",
};

export default function PreviewConsole({ lines, emptyLabel }: { lines: ConsoleLine[]; emptyLabel: string }) {
  return (
    <div className="max-h-64 min-h-[6rem] overflow-y-auto rounded-lg border border-base-border bg-base-bg p-2.5 font-mono text-xs">
      {lines.length === 0 ? (
        <p className="text-ink-faint">{emptyLabel}</p>
      ) : (
        lines.map((line, i) => (
          <p key={i} className={`whitespace-pre-wrap break-words py-0.5 ${LEVEL_COLOR[line.level]}`}>
            <span className="text-ink-faint">&gt; </span>
            {line.text}
          </p>
        ))
      )}
    </div>
  );
}
