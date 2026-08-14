"use client";

import { useState } from "react";
import { Github } from "lucide-react";

/** Small square icon for a repo: real logo image if we found one, else a generic GitHub icon. */
export default function RepoIcon({ logoUrl, size = 28 }: { logoUrl?: string | null; language?: string | null; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        className="shrink-0 rounded-md border border-base-border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md border border-base-border bg-base-surface2 text-ink-faint"
      style={{ width: size, height: size }}
    >
      <Github size={size * 0.6} strokeWidth={1.75} />
    </div>
  );
}
