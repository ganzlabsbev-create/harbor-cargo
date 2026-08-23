"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { UploadCloud, FileUp, Clock } from "lucide-react";
import { useLang } from "@/lib/i18n-context";
import { useCountdown } from "@/lib/use-elapsed";

export interface UploadedBlob {
  url: string;
  pathname: string;
}

const MAX_FILE_BYTES = 200 * 1024 * 1024; // keep in sync with app/api/upload/blob-token/route.ts

/**
 * Handles the "upload + analyze" step only. The file is uploaded directly
 * to Vercel Blob storage from the browser (so there's no ~4.5MB server body
 * limit), then the resulting blob URL is handed to `endpoint` to analyze.
 * The blob itself is kept alive server-side until the push/commit step
 * consumes and deletes it — see lib/use-blob-cleanup.ts for what happens if
 * the user abandons the flow before that.
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
  onAnalyzed: (blob: UploadedBlob, result: any, fileName: string) => void;
  /** Lets the "update repo" flow point this at /api/diff instead. */
  endpoint?: string;
  /** Extra fields to send alongside the blob reference (e.g. owner/repo/branch). */
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
  // Which part of submit() is currently running, so the label (and the
  // elapsed-time counter next to it) can reflect real progress instead of
  // one static "Analyzing..." string for the whole request.
  const [stage, setStage] = useState<"checking" | "uploading" | "processing" | null>(null);
  // Real, measured progress (0-100) behind the fill visual — never a timer.
  // "checking" jumps to a small starting value on entry (a true event, not
  // a guess), "uploading" tracks real bytes-sent via onUploadProgress, and
  // "processing" holds at its stage-3 starting point since there's no
  // client-visible signal for that stage today.
  const [uploadPercent, setUploadPercent] = useState(0);
  // Seconds left on an active rate-limit cooldown, ticking down live until
  // it hits 0 ("unlocked") — set from the server's retryAfterSeconds and
  // then counted down purely on the client. null = not rate-limited.
  const [rateLimitStart, setRateLimitStart] = useState<number | null>(null);

  const rateLimitRemaining = useCountdown(rateLimitStart);
  const isRateLimited = rateLimitStart !== null && (rateLimitRemaining ?? 0) > 0;

  // Once the countdown reaches 0, clear it so the dropzone goes back to its
  // normal clickable state (and so a future rate-limit hit starts fresh).
  useEffect(() => {
    if (rateLimitStart !== null && rateLimitRemaining === 0) {
      setRateLimitStart(null);
    }
  }, [rateLimitRemaining, rateLimitStart]);

  async function submit(file: File, kind: "zip" | "loose", fileCount: number) {
    if (file.size > MAX_FILE_BYTES) {
      setError(t("file_too_large_message"));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      setStage("checking");
      // No granular signal is possible for this stage (one fast fetch), so
      // this jump reflects a real, true event — "pre-check started" — not a
      // timer or a guessed duration.
      setUploadPercent(8);
      const rateLimitRes = await fetch("/api/upload/rate-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, fileCount }),
      });
      const rateLimitData = await rateLimitRes.json();
      if (!rateLimitData.ok) {
        if (rateLimitData.error === "rate_limited") {
          // Show a live countdown instead of a one-time static message —
          // the dropzone re-enables itself the moment it reaches 0.
          setRateLimitStart(rateLimitData.retryAfterSeconds);
          return;
        }
        throw new Error(rateLimitData.error || "rate_limit_check_failed");
      }

      setStage("uploading");
      const blobResult = await upload(`uploads/${crypto.randomUUID()}.zip`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/blob-token",
        // Fired continuously as bytes actually go out over the wire — this
        // stage owns roughly 10%→90% of the total fill, mapped directly and
        // continuously from real loaded/total bytes (no easing that lags
        // behind what's really happening).
        onUploadProgress: (p) => setUploadPercent(10 + p.percentage * 0.8),
      });
      const blobRef: UploadedBlob = { url: blobResult.url, pathname: blobResult.pathname };

      // No client-visible progress signal exists for server-side extraction
      // and analysis today, so this stage honestly holds near its starting
      // point (see the pulse on the fill layer below) instead of faking a
      // percentage that keeps climbing.
      setStage("processing");
      setUploadPercent(90);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blobRef.url, blobPathname: blobRef.pathname, ...(extraFields || {}) }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "upload_failed");
      }
      // Snap to 100% briefly before the view changes, so the fill actually
      // reads as "done" instead of jumping straight from 90% to gone.
      setUploadPercent(100);
      await new Promise((r) => setTimeout(r, 200));
      onAnalyzed(blobRef, data, file.name);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setUploading(false);
      setStage(null);
      setUploadPercent(0);
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
      await submit(zippedFile, "loose", files.length);
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
      submit(files[0], "zip", 1);
      return;
    }
    zipAndSubmit(files);
  }

  const busy = isUploading || isZipping;

  // Label for whatever is actively happening — reflects real progress
  // through submit() (checking the limit, uploading, then processing)
  // rather than one generic string for the whole request.
  let busyLabel = uploadingLabel || t("upload_uploading");
  if (isZipping) busyLabel = t("zipping_files");
  else if (stage === "checking") busyLabel = t("checking_limit");
  else if (stage === "uploading") busyLabel = t("uploading_file");
  else if (stage === "processing") busyLabel = uploadingLabel || t("upload_uploading");

  if (isRateLimited) {
    return (
      <div>
        <div className="relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-base-border bg-base-surface2 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-base-border bg-base-surface text-harbor-orange">
            <Clock size={22} strokeWidth={1.75} />
          </div>
          <p className="font-display text-base font-medium text-ink">
            {t("rate_limited_countdown").replace("{seconds}", String(rateLimitRemaining ?? 0))}
          </p>
        </div>
      </div>
    );
  }

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
        {isUploading && (
          // Real, measured progress — a colored layer rising from the
          // bottom edge to the top, height = actual percentage. During
          // "processing" (no client-visible signal exists) this holds near
          // its starting point with a subtle pulse instead of faking motion.
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 bg-harbor-orange/20 ${
              stage === "processing" ? "animate-pulse transition-none" : "transition-[height] duration-150 ease-out"
            }`}
            style={{ height: `${uploadPercent}%` }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-ink-dim ${
              isZipping ? "animate-pulse" : ""
            }`}
          >
            <UploadCloud size={22} strokeWidth={1.75} className={busy ? "text-harbor-orange" : undefined} />
          </div>
          <p className="font-display text-base font-medium text-ink">{busy ? busyLabel : t("upload_title")}</p>
        </div>
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
            <p className="mt-2 text-[11px] text-ink-faint">{t("upload_size_hint")}</p>
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
