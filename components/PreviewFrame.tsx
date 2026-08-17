"use client";

import { useEffect } from "react";

export interface ConsoleLine {
  level: "log" | "warn" | "error" | "info";
  text: string;
  ts: number;
}

/**
 * Renders a Harbor Preview document in a sandboxed iframe. No
 * allow-same-origin is granted — the iframe runs as a unique opaque origin,
 * and the only channel back to the host page is the postMessage bridge
 * injected into the document by lib/static-preview.ts.
 */
export default function PreviewFrame({
  html,
  frameKey,
  onMessage,
}: {
  html: string;
  frameKey: number;
  onMessage: (line: ConsoleLine) => void;
}) {
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || data.__harborPreview !== true) return;
      if (typeof data.type !== "string" || !data.type.startsWith("console:")) return;
      const level = data.type.slice("console:".length) as ConsoleLine["level"];
      onMessage({ level, text: (data.args || []).join(" "), ts: Date.now() });
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onMessage]);

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
