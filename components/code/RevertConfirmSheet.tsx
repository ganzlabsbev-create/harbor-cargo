"use client";

import { AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/i18n-context";

/**
 * Shared confirmation sheet for the two "discard unsaved changes" actions in
 * the editor toolbar — reverting just the currently open file, or reverting
 * every pending change across the whole project. Both are destructive
 * (unsaved work is lost, not just hidden), so both go through this warning
 * rather than firing immediately on tap.
 */
export default function RevertConfirmSheet({
  scope,
  fileName,
  fileCount,
  onClose,
  onConfirm,
}: {
  scope: "file" | "project";
  fileName?: string;
  fileCount?: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div className="flex flex-col gap-3 rounded-t-2xl border-t border-base-border bg-base-surface p-4 pb-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-red/10 text-accent-red">
            <AlertTriangle size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {scope === "file" ? t("code_revert_file_confirm_title") : t("code_revert_project_confirm_title")}
            </p>
            {scope === "file" && fileName ? (
              <p className="truncate font-mono text-xs text-ink-faint">{fileName}</p>
            ) : (
              <p className="text-xs text-ink-faint">
                {t("code_revert_project_confirm_desc").replace("{count}", String(fileCount ?? 0))}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-base-border px-4 py-3 text-sm font-medium text-ink-dim active:shadow-glow-orange">
            {t("cancel")}
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-accent-red px-4 py-3 text-sm font-semibold text-white active:scale-[0.98]">
            {t("code_revert_confirm_button")}
          </button>
        </div>
      </div>
    </div>
  );
}
