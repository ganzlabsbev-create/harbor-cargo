import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export default function ToolCard({
  href,
  icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  /** Optional small pill floated over the top-right corner, e.g. "DEMO". */
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card transition active:scale-[0.99]"
    >
      {badge && (
        <span className="absolute -top-2 right-3 rounded-full border border-harbor-blue/70 bg-transparent px-2 py-0.5 text-[10px] font-semibold tracking-wide text-harbor-blue">
          {badge}
        </span>
      )}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-harbor-blue to-harbor-navy text-ink shadow-glow-blue">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-semibold text-ink">{title}</p>
        <p className="truncate text-sm text-ink-dim">{description}</p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-ink-faint transition group-active:translate-x-0.5" />
    </Link>
  );
}


