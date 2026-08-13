"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n-context";

/**
 * Handles the "upload + analyze" step only. The selected File object is
 * handed back to the parent page (kept in React state, never localStorage)
 * so it can be re-sent on the actual push request later — see build spec
 * section 2.3 (no Vercel Blob, no server-side file persistence between steps).
 */
export default function UploadZone({
  onAnalyzed,
  endpoint = "/api/upload",
  extraFields,
  uploadingLabel,
}: {
  onAnalyzed: (file: File, result: any) => void;
  /** Lets the "update repo" flow point this at /api/diff instead. */
  endpoint?: string;
  /** Extra form fields to send alongside the file (e.g. owner/repo/branch). */
  extraFields?: Record<string, string>;
  /** Overrides the "Analyzing..." label — e.g. "Comparing against repo...". */
  uploadingLabel?: string;
}) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError(t("no_zip_error"));
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (extraFields) {
        for (const [key, value] of Object.entries(extraFields)) formData.append(key, value);
      }
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) {
        throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "upload_failed");
      }
      onAnalyzed(file, data);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-12 text-center transition active:scale-[0.99] ${
          isDragging
            ? "border-harbor-orange bg-harbor-orange/5 shadow-glow-orange"
            : "border-base-border bg-base-surface hover:border-ink-faint/50"
        }`}
      >
        {isUploading ? (
          <Loader2 size={28} strokeWidth={2} className="animate-spin text-harbor-orange" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-ink-dim">
            <UploadCloud size={22} strokeWidth={1.75} />
          </div>
        )}
        <p className="font-display text-base font-medium text-ink">
          {isUploading ? uploadingLabel || t("upload_uploading") : t("upload_title")}
        </p>
        {!isUploading && (
          <>
            <span className="text-xs text-ink-faint">{t("upload_or")}</span>
            <span className="rounded-lg bg-harbor-orange px-4 py-2 text-sm font-medium text-white shadow-glow-orange">
              {t("upload_button")}
            </span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-sm text-accent-red">{error}</p>}
    </div>
  );
}
