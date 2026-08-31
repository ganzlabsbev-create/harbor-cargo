"use client";

import { AlertTriangle } from "lucide-react";
import { useEscapeClose } from "@/lib/use-escape-close";

export default function ConfirmMoveDialog({
  fileName,
  kind = "file",
  onReplace,
  onRename,
  onCancel,
  t,
}: {
  fileName: string;
  /** "folder" means the drop target path is occupied by an existing directory, not a file — a folder can't be replaced by a dropped file, so only rename is offered. */
  kind?: "file" | "folder";
  onReplace: () => void;
  onRename: () => void;
  onCancel: () => void;
  t: (k: any) => string;
}) {
  const isFolder = kind === "folder";
  useEscapeClose(onCancel);
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onCancel}>
      <div
        className="flex flex-col gap-3 rounded-t-2xl border-t border-base-border bg-base-surface p-4 pb-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-harbor-orange">
          <AlertTriangle size={18} />
          <h2 className="font-display text-base font-semibold text-ink">
            {t(isFolder ? "move_folder_collision_title" : "move_collision_title")}
          </h2>
        </div>
        <p className="text-sm text-ink-dim">
          {t(isFolder ? "move_folder_collision_desc" : "move_collision_desc")} <span className="font-mono text-ink">{fileName}</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!isFolder && (
            <button
              onClick={onReplace}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-harbor-orange px-4 py-2.5 text-sm font-semibold text-white shadow-glow-orange"
            >
              {t("move_collision_replace")}
            </button>
          )}
          <button
            onClick={onRename}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-base-border bg-base-surface px-4 py-2.5 text-sm font-medium text-ink-dim"
          >
            {t("move_collision_rename")}
          </button>
        </div>
        <button onClick={onCancel} className="self-center text-xs text-ink-faint underline">
          {t("move_collision_cancel")}
        </button>
      </div>
    </div>
  );
}
