"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, Smartphone } from "lucide-react";
import Header from "@/components/Header";
import ToolCard from "@/components/ToolCard";
import { useLang } from "@/lib/i18n-context";

/**
 * "Harbor" is the category of tools Harbor Cargo builds itself (as opposed
 * to GitHub/Vercel, which are integrations with someone else's service).
 * Today that's Preview (existing, at /tools/preview — route unchanged) and
 * PWA (new, at /tools/harbor/pwa). Add future in-house tools here the same
 * way ToolGrid on the home page is extended.
 */
export default function HarborPage() {
  const { t } = useLang();

  const tools = [
    {
      href: "/tools/preview",
      icon: <Image src="/harbor-preview.svg" alt="" width={26} height={26} unoptimized />,
      title: t("tool_preview_title"),
      description: t("tool_preview_desc"),
    },
    {
      href: "/tools/harbor/pwa",
      icon: <Smartphone size={22} strokeWidth={1.75} />,
      title: t("tool_pwa_title"),
      description: t("tool_pwa_desc"),
      badge: "DEMO",
    },
  ];

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("tool_harbor_title")}</h1>
        <p className="mb-4 mt-1 text-sm text-ink-dim">{t("harbor_page_desc")}</p>
        <div className="flex flex-col gap-3">
          {tools.map((tool) => (
            <ToolCard key={tool.href} {...tool} />
          ))}
        </div>
      </div>
    </main>
  );
}
