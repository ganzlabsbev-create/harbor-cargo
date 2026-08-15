import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export default function ToolCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card transition active:scale-[0.99]"
    >
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


