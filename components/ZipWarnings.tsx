"use client";

import { TriangleAlert } from "lucide-react";
import { useLang } from "@/lib/i18n-context";

export interface ZipWarningsData {
  oversizedFiles: string[];
  caseCollisions: string[][];
  skippedUnsafePaths: string[];
}

/** Compact, collapsible-by-nature warning strip — renders nothing if there's nothing to warn about. */
export default function ZipWarnings({ warnings }: { warnings: ZipWarningsData | null | undefined }) {
  const { t } = useLang();
  if (!warnings) return null;

  const lines: string[] = [];
  if (warnings.oversizedFiles.length > 0) {
    lines.push(t("warning_oversized_files").replace("{files}", warnings.oversizedFiles.join(", ")));
  }
  if (warnings.caseCollisions.length > 0) {
    lines.push(t("warning_case_collisions").replace("{files}", warnings.caseCollisions.map((pair) => pair.join(" / ")).join(", ")));
  }
  if (warnings.skippedUnsafePaths.length > 0) {
    lines.push(t("warning_skipped_unsafe").replace("{files}", warnings.skippedUnsafePaths.join(", ")));
  }

  if (lines.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-accent-orange/30 bg-accent-orange/5 px-3 py-2 text-xs text-accent-orange">
      <div className="flex items-center gap-1.5 font-medium">
        <TriangleAlert size={13} /> {t("warnings_title")}
      </div>
      {lines.map((line, i) => (
        <p key={i} className="text-ink-dim">
          {line}
        </p>
      ))}
    </div>
  );
}
