"use client";

import { AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/i18n-context";
import { useEscapeClose } from "@/lib/use-escape-close";

export default function DeleteFileConfirmSheet({
  path,
  onClose,
  onConfirm,
}: {
  path: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLang();
  useEscapeClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div className="flex flex-col gap-3 rounded-t-2xl border-t border-base-border bg-base-surface p-4 pb-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-red/10 text-accent-red">
            <AlertTriangle size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{t("code_delete_confirm_title")}</p>
            <p className="truncate font-mono text-xs text-ink-faint">{path}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-base-border px-4 py-3 text-sm font-medium text-ink-dim">
            {t("cancel")}
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-accent-red px-4 py-3 text-sm font-semibold text-white">
            {t("code_delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
