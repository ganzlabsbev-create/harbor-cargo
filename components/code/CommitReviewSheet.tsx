"use client";

import { useState } from "react";
import { X, Loader2, AlertTriangle, FilePlus, FileMinus, FileEdit, ArrowRight } from "lucide-react";
import { computeLineDiff, collapseContext } from "@/lib/line-diff";
import { useLang } from "@/lib/i18n-context";
import type { PendingChange } from "@/lib/code-changes";

/**
 * Review-before-commit (build spec enhancement: show what's about to
 * change before pushing, same instinct as Danger Zone's confirmation
 * step). Works the same whether there's one pending change or a dozen —
 * "Save" on a single file and a multi-file batch commit both land here.
 */
export default function CommitReviewSheet({
  changes,
  defaultMessage,
  onClose,
  onConfirm,
}: {
  changes: PendingChange[];
  defaultMessage: string;
  onClose: () => void;
  onConfirm: (message: string) => Promise<void>;
}) {
  const { t } = useLang();
  const [message, setMessage] = useState(defaultMessage);
  const [openPath, setOpenPath] = useState<string | null>(changes[0] ? changeKey(changes[0]) : null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(message.trim() || defaultMessage);
    } catch (err: any) {
      setError(String(err?.message || err));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={submitting ? undefined : onClose}>
      <div
        className="flex max-h-[88dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl border-t border-base-border bg-base-surface p-4 pb-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">
            {t("code_review_title")} ({changes.length})
          </h2>
          {!submitting && (
            <button onClick={onClose} className="text-ink-faint">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {changes.map((c) => {
            const key = changeKey(c);
            const isOpen = openPath === key;
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-base-border">
                <button
                  onClick={() => setOpenPath(isOpen ? null : key)}
                  className="flex w-full items-center gap-2 bg-base-surface2 px-3 py-2.5 text-left"
                >
                  <ChangeIcon change={c} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{changeLabel(c)}</span>
                </button>
                {isOpen && (
                  <div className="max-h-56 overflow-y-auto bg-base-bg p-2 font-mono text-[11px] leading-5">
                    <DiffBody change={c} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink-dim">{t("code_commit_message")}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink"
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-accent-red/30 bg-accent-red/10 p-3 text-sm text-accent-red">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={submitting} className="flex-1 rounded-xl border border-base-border px-4 py-3 text-sm font-medium text-ink-dim">
            {t("cancel")}
          </button>
          <button
            onClick={confirm}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-harbor-orange px-4 py-3 text-sm font-semibold text-white shadow-glow-orange disabled:opacity-60"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {t("code_commit_button")}
          </button>
        </div>
      </div>
    </div>
  );
}

function changeKey(c: PendingChange): string {
  return c.kind === "rename" ? c.fromPath : c.path;
}

function changeLabel(c: PendingChange): string {
  if (c.kind === "rename") return `${c.fromPath} → ${c.toPath}`;
  return c.path;
}

function ChangeIcon({ change }: { change: PendingChange }) {
  if (change.kind === "add") return <FilePlus size={14} className="shrink-0 text-accent-green" />;
  if (change.kind === "delete") return <FileMinus size={14} className="shrink-0 text-accent-red" />;
  if (change.kind === "rename") return <ArrowRight size={14} className="shrink-0 text-harbor-blue" />;
  return <FileEdit size={14} className="shrink-0 text-harbor-orange" />;
}

function DiffBody({ change }: { change: PendingChange }) {
  const { t } = useLang();
  if (change.kind === "add") {
    return <pre className="whitespace-pre-wrap text-accent-green">{change.content.split("\n").slice(0, 400).join("\n")}</pre>;
  }
  if (change.kind === "delete") {
    return <p className="text-ink-faint">{t("code_review_delete_note")}</p>;
  }
  if (change.kind === "rename" && change.content === undefined) {
    return <p className="text-ink-faint">{t("code_review_rename_note")}</p>;
  }

  const oldText = change.kind === "edit" ? change.originalContent : "";
  const newText = change.content ?? "";
  const lines = collapseContext(computeLineDiff(oldText, newText), 2);
  return (
    <div>
      {lines.map((l, i) =>
        "count" in l ? (
          <div key={i} className="my-0.5 text-ink-faint">
            ⋯ {l.count} {t("code_review_unchanged_lines")}
          </div>
        ) : (
          <div
            key={i}
            className={
              l.type === "add" ? "bg-accent-green/10 text-accent-green" : l.type === "remove" ? "bg-accent-red/10 text-accent-red" : "text-ink-faint"
            }
          >
            {l.type === "add" ? "+ " : l.type === "remove" ? "- " : "  "}
            {l.text}
          </div>
        )
      )}
    </div>
  );
}
