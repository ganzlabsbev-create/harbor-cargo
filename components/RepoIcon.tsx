"use client";

import { useState } from "react";
import { Github } from "lucide-react";

// Same palette GitHub itself uses for the little language dot, for the
// languages people actually push through HARBOR CARGO. Anything not
// listed here just falls back to the plain GitHub icon.
const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  PHP: "#4F5D95",
  Ruby: "#701516",
  Shell: "#89e051",
  Dart: "#00B4AB",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
};

/** Small square icon for a repo: real logo image if we found one, else a language color dot, else a generic GitHub icon. */
export default function RepoIcon({ logoUrl, language, size = 28 }: { logoUrl?: string | null; language?: string | null; size?: number }) {
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

  const color = language ? LANGUAGE_COLORS[language] : null;
  if (color) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-md border border-base-border bg-base-surface2"
        style={{ width: size, height: size }}
      >
        <span className="rounded-full" style={{ width: size * 0.4, height: size * 0.4, backgroundColor: color }} />
      </div>
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
