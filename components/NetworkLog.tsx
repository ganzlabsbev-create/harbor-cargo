"use client";

export type NetworkKind = "resource" | "fetch" | "xhr";
export interface NetworkEntry {
  /** Original request URL as seen by the page (often a blob: URL in static preview mode). */
  url: string;
  /** Project-relative path when it could be resolved, otherwise falls back to `url`. */
  name: string;
  ok: boolean;
  status: number | null;
  kind: NetworkKind;
  ts: number;
}

const KIND_LABEL: Record<NetworkKind, string> = {
  resource: "asset",
  fetch: "fetch",
  xhr: "xhr",
};

function statusLabel(entry: NetworkEntry): string {
  if (entry.status != null) return String(entry.status);
  return entry.ok ? "200" : "failed";
}

export default function NetworkLog({
  entries,
  emptyLabel,
  unavailableLabel,
}: {
  entries: NetworkEntry[];
  emptyLabel: string;
  /** Shown instead of the table when the current preview mode can't report network activity at all (e.g. Dev Server mode). */
  unavailableLabel?: string;
}) {
  if (unavailableLabel) {
    return (
      <div className="rounded-lg border border-base-border bg-base-bg p-3 text-xs text-ink-faint">
        {unavailableLabel}
      </div>
    );
  }

  return (
    <div className="max-h-64 min-h-[6rem] overflow-y-auto rounded-lg border border-base-border bg-base-bg p-2.5 font-mono text-xs">
      {entries.length === 0 ? (
        <p className="text-ink-faint">{emptyLabel}</p>
      ) : (
        entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span className={`shrink-0 ${entry.ok ? "text-accent-green" : "text-accent-red"}`}>
              {entry.ok ? "✓" : "✕"}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-dim" title={entry.name}>
              {entry.name}
            </span>
            <span className="shrink-0 text-ink-faint">{KIND_LABEL[entry.kind]}</span>
            <span className={`w-12 shrink-0 text-right ${entry.ok ? "text-ink-faint" : "text-accent-red"}`}>
              {statusLabel(entry)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
