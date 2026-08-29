"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/i18n-context";

/**
 * Shared prompt for "new file" and "rename" — both are just "give me a
 * path", so one small sheet covers both instead of two near-identical
 * components.
 */
export default function PathPromptSheet({
  title,
  initialPath,
  existingPaths,
  onClose,
  onSubmit,
}: {
  title: string;
  initialPath: string;
  existingPaths: Set<string>;
  onClose: () => void;
  onSubmit: (path: string) => void;
}) {
  const { t } = useLang();
  const [path, setPath] = useState(initialPath);

  const trimmed = path.trim().replace(/^\/+/, "");
  const invalid = !trimmed || trimmed.endsWith("/") || trimmed.includes("..");
  const collides = !invalid && existingPaths.has(trimmed) && trimmed !== initialPath;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div className="flex flex-col gap-3 rounded-t-2xl border-t border-base-border bg-base-surface p-4 pb-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-faint">
            <X size={20} />
          </button>
        </div>

        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          autoFocus
          placeholder="components/Header.tsx"
          className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-faint"
        />

        {collides && (
          <p className="flex items-center gap-1.5 text-xs text-accent-red">
            <AlertTriangle size={13} /> {t("code_path_collides")}
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-base-border px-4 py-3 text-sm font-medium text-ink-dim">
            {t("cancel")}
          </button>
          <button
            onClick={() => onSubmit(trimmed)}
            disabled={invalid || collides}
            className="flex-1 rounded-xl bg-harbor-orange px-4 py-3 text-sm font-semibold text-white shadow-glow-orange disabled:opacity-50"
          >
            {t("code_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
