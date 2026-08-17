"use client";

import { useEffect } from "react";
import type { PreviewLogLine } from "./PreviewLog";

/** @deprecated kept as an alias so any external import of the old name still works — use PreviewLogLine (components/PreviewLog.tsx) directly in new code. */
export type ConsoleLine = PreviewLogLine;

/**
 * Renders a Harbor Preview document in a sandboxed iframe.
 *
 * Two modes:
 * - `html` (Phase 1, static projects): srcDoc with no allow-same-origin —
 *   the iframe runs as a unique opaque origin, and the only channel back to
 *   the host page is the postMessage bridge injected by lib/static-preview.ts.
 * - `src` (Phase 2, dev-server projects): points at the live WebContainer
 *   preview URL from lib/dev-server-preview.ts. That URL is already a
 *   genuine cross-origin *.webcontainer-api.io origin (not same-origin with
 *   Harbor), so allow-same-origin here doesn't grant it any access back into
 *   the host page — it's required only because the dev servers WebContainer
 *   runs (Next/Vite/etc.) read `document.domain`/storage APIs on boot and
 *   fail without it. There is no console bridge in this mode (we can't
 *   inject into someone else's dev server's HTML), so devServer console
 *   output is instead read from lib/dev-server-preview.ts's process log.
 */
export default function PreviewFrame({
  html,
  src,
  frameKey,
  onMessage,
}: {
  html?: string;
  src?: string;
  frameKey: number;
  onMessage: (line: PreviewLogLine) => void;
}) {
  useEffect(() => {
    if (src) return; // no postMessage bridge available for a cross-origin dev server URL
    function handleMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || data.__harborPreview !== true) return;
      if (typeof data.type !== "string" || !data.type.startsWith("console:")) return;
      const level = data.type.slice("console:".length) as PreviewLogLine["level"];
      onMessage({ level, text: (data.args || []).join(" "), ts: Date.now() });
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onMessage, src]);

  if (src) {
    return (
      <iframe
        key={frameKey}
        src={src}
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
        className="h-full w-full rounded-xl border border-base-border bg-white"
        title="Harbor Preview"
      />
    );
  }

  return (
    <iframe
      key={frameKey}
      srcDoc={html}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      className="h-full w-full rounded-xl border border-base-border bg-white"
      title="Harbor Preview"
    />
  );
}
