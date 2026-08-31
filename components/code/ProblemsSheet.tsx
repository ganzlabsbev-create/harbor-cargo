"use client";

import { X, AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/i18n-context";
import { useEscapeClose } from "@/lib/use-escape-close";
import type { CodeDiagnostic } from "@/lib/code-lang";

/**
 * Full-detail error list (build spec follow-up: a gutter dot alone isn't
 * enough — show every problem with its exact line/column and message, and
 * let tapping one jump straight to it). One panel per open file's current
 * diagnostics, not a project-wide problems list — the editor only parses
 * whichever file is actually open.
 */
export default function ProblemsSheet({
  fileName,
  diagnostics,
  onClose,
  onJump,
}: {
  fileName: string;
  diagnostics: CodeDiagnostic[];
  onClose: () => void;
  onJump: (line: number) => void;
}) {
  const { t } = useLang();
  useEscapeClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[75dvh] flex-col gap-2 overflow-y-auto rounded-t-2xl border-t border-base-border bg-base-surface p-4 pb-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink">{t("code_problems_title")}</h2>
            <p className="truncate font-mono text-xs text-ink-faint">{fileName}</p>
          </div>
          <button onClick={onClose} className="text-ink-faint">
            <X size={20} />
          </button>
        </div>

        {diagnostics.length === 0 ? (
          <p className="py-4 text-sm text-ink-faint">{t("code_problems_none")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {diagnostics.map((d, i) => (
              <button
                key={i}
                onClick={() => {
                  onJump(d.line);
                  onClose();
                }}
                className="flex items-start gap-2.5 rounded-xl border border-base-border bg-base-bg p-3 text-left active:bg-base-surface2"
              >
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-accent-red" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{d.message}</p>
                  <p className="mt-0.5 font-mono text-xs text-ink-faint">
                    {t("code_problems_line_col_prefix")} {d.line}:{d.col}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
