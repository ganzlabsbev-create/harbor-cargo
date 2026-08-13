"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2, FileUp } from "lucide-react";
import { useLang } from "@/lib/i18n-context";

/**
 * Handles the "upload + analyze" step only. The selected File object is
 * handed back to the parent page (kept in React state, never localStorage)
 * so it can be re-sent on the actual push request later — see build spec
 * section 2.3 (no Vercel Blob, no server-side file persistence between steps).
 *
 * Accepts either a single .zip, or one/many loose files — loose files get
 * bundled into an in-memory ZIP client-side (via JSZip) before being sent,
 * so the rest of the app (analyze/diff/push endpoints) never has to know
 * the difference.
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
  const zipInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [isZipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(file: File) {
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

  /** One or more loose files (not already a .zip) — bundle client-side into a ZIP. */
  async function zipAndSubmit(files: File[]) {
    setError(null);
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const file of files) {
        // Preserve folder structure if the browser gave us one (e.g. a
        // dragged folder), otherwise just use the flat filename.
        let relPath = (file as any).webkitRelativePath || file.name;
        if (usedNames.has(relPath)) {
          const dot = relPath.lastIndexOf(".");
          relPath =
            dot > 0
              ? `${relPath.slice(0, dot)}-${usedNames.size}${relPath.slice(dot)}`
              : `${relPath}-${usedNames.size}`;
        }
        usedNames.add(relPath);
        zip.file(relPath, await file.arrayBuffer());
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const zippedFile = new File([blob], `upload-${Date.now()}.zip`, { type: "application/zip" });
      setZipping(false);
      await submit(zippedFile);
    } catch (err: any) {
      setZipping(false);
      setError(String(err?.message || err));
    }
  }

  function handleIncoming(fileList: FileList | File[]) {
    setError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
      submit(files[0]);
      return;
    }
    zipAndSubmit(files);
  }

  const busy = isUploading || isZipping;

  return (
    <div>
      <div
        onClick={() => filesInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) handleIncoming(e.dataTransfer.files);
        }}
        className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-12 text-center transition active:scale-[0.99] ${
          isDragging
            ? "border-harbor-orange bg-harbor-orange/5 shadow-glow-orange"
            : "border-base-border bg-base-surface hover:border-ink-faint/50"
        }`}
      >
        {busy ? (
          <Loader2 size={28} strokeWidth={2} className="animate-spin text-harbor-orange" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-ink-dim">
            <UploadCloud size={22} strokeWidth={1.75} />
          </div>
        )}
        <p className="font-display text-base font-medium text-ink">
          {isZipping ? t("zipping_files") : busy ? uploadingLabel || t("upload_uploading") : t("upload_title")}
        </p>
        {!busy && (
          <>
            <span className="text-xs text-ink-faint">{t("upload_or")}</span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  zipInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 rounded-lg bg-harbor-orange px-4 py-2 text-sm font-medium text-white shadow-glow-orange"
              >
                <UploadCloud size={14} /> {t("upload_button")}
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  filesInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-base-border bg-base-surface2 px-4 py-2 text-sm font-medium text-ink-dim"
              >
                <FileUp size={14} /> {t("upload_files_button")}
              </span>
            </div>
          </>
        )}
      </div>

      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleIncoming(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleIncoming(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-sm text-accent-red">{error}</p>}
    </div>
  );
}
