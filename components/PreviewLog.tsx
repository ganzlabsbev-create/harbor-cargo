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

// Matches "src/App.jsx:42" or "main.js:12:5" — the location Harbor's static
// bridge script (lib/static-preview.ts) appends to runtime error messages.
// Kept deliberately narrow (common source extensions only) so we don't
// accidentally linkify something like a version number or timestamp that
// happens to contain a colon.
const FILE_LOCATION_RE =
  /([\w.\-/]+\.(?:jsx?|tsx?|mjs|cjs|css|html?|vue|svelte))(?::(\d+))?(?::(\d+))?/g;

/** Splits a log line's text into plain strings and clickable {path, line} segments. */
function renderWithFileLinks(text: string, onOpenFile?: (path: string, line?: number) => void) {
  if (!onOpenFile) return stripAnsi(text);
  const clean = stripAnsi(text);
  const parts: (string | { path: string; line?: number; key: string })[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  FILE_LOCATION_RE.lastIndex = 0;
  while ((match = FILE_LOCATION_RE.exec(clean))) {
    if (match.index > lastIndex) parts.push(clean.slice(lastIndex, match.index));
    const [full, path, line] = match;
    parts.push({ path, line: line ? Number(line) : undefined, key: `${match.index}` });
    lastIndex = match.index + full.length;
  }
  if (lastIndex < clean.length) parts.push(clean.slice(lastIndex));

  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <button
        key={i}
        onClick={() => onOpenFile(p.path, p.line)}
        className="underline decoration-dotted underline-offset-2 hover:text-harbor-orange"
      >
        {p.path}
        {p.line ? `:${p.line}` : ""}
      </button>
    )
  );
}

export default function PreviewLog({
  lines,
  emptyLabel,
  onOpenFile,
}: {
  lines: PreviewLogLine[];
  emptyLabel: string;
  /** Called when the person taps a "file.js:12" location inside a log line — lets the page jump to that source in the Files panel. */
  onOpenFile?: (path: string, line?: number) => void;
}) {
  return (
    <div className="max-h-64 min-h-[6rem] overflow-y-auto rounded-lg border border-base-border bg-base-bg p-2.5 font-mono text-xs">
      {lines.length === 0 ? (
        <p className="text-ink-faint">{emptyLabel}</p>
      ) : (
        lines.map((line, i) => (
          <p key={i} className={`whitespace-pre-wrap break-words py-0.5 ${LEVEL_COLOR[line.level]}`}>
            <span className="text-ink-faint">{LEVEL_PREFIX[line.level]}&nbsp;</span>
            {renderWithFileLinks(line.text, onOpenFile)}
          </p>
        ))
      )}
    </div>
  );
}
