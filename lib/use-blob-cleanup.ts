"use client";

import { useEffect, useRef } from "react";
import type { UploadedBlob } from "@/components/UploadZone";

/** Fire-and-forget delete, safe to call even on an already-deleted blob. */
export function cleanupBlob(pathname: string) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  const body = new Blob([JSON.stringify({ pathname })], { type: "application/json" });
  navigator.sendBeacon("/api/upload/blob-cleanup", body);
}

/**
 * Deletes the current blob if the user leaves the page (client-side
 * navigation, tab close, or refresh) without ever pushing/committing it.
 * Harmless to also fire after a successful push/commit — the server already
 * deleted that blob, and deleting it again is a no-op.
 */
export function useBlobCleanup(blob: UploadedBlob | null) {
  const blobRef = useRef<UploadedBlob | null>(null);
  blobRef.current = blob;

  useEffect(() => {
    function handleUnload() {
      if (blobRef.current) cleanupBlob(blobRef.current.pathname);
    }
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("pagehide", handleUnload);
      handleUnload();
    };
  }, []);
}
