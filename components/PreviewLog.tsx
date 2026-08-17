"use client";

export type PreviewLogLevel = "log" | "info" | "warn" | "error" | "install" | "dev";
export interface PreviewLogLine {
  level: PreviewLogLevel;
  text: string;
  ts: number;
}

const LEVEL_COLOR: Record<PreviewLogLevel, string> = {
  log: "text-ink-dim",
  info: "text-harbor-blue",
  warn: "text-amber-500",
  error: "text-accent-red",
  install: "text-ink-faint",
  dev: "text-accent-green",
};

const LEVEL_PREFIX: Record<PreviewLogLevel, string> = {
  log: ">",
  info: "i",
  warn: "!",
  error: "✕",
  install: "npm",
  dev: "dev",
};

// npm/Vite/Next CLI output is full of ANSI color codes when captured
// programmatically — strip them so the log reads cleanly in a plain <pre>
// instead of showing raw escape sequences like "\u001b[32m".
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

export default function PreviewLog({ lines, emptyLabel }: { lines: PreviewLogLine[]; emptyLabel: string }) {
  return (
    <div className="max-h-64 min-h-[6rem] overflow-y-auto rounded-lg border border-base-border bg-base-bg p-2.5 font-mono text-xs">
      {lines.length === 0 ? (
        <p className="text-ink-faint">{emptyLabel}</p>
      ) : (
        lines.map((line, i) => (
          <p key={i} className={`whitespace-pre-wrap break-words py-0.5 ${LEVEL_COLOR[line.level]}`}>
            <span className="text-ink-faint">{LEVEL_PREFIX[line.level]}&nbsp;</span>
            {stripAnsi(line.text)}
          </p>
        ))
      )}
    </div>
  );
}
