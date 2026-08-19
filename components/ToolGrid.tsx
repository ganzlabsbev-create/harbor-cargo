"use client";

import Image from "next/image";
import ToolCard from "./ToolCard";
import { GithubMark, VercelMark } from "./BrandIcons";
import { useLang } from "@/lib/i18n-context";

// Reusable, additive grid: append a { href, icon, titleKey, descKey } entry
// here for each future tool/destination — no other file needs to change.
export default function ToolGrid() {
  const { t } = useLang();
  const tools = [
    {
      href: "/tools/harbor",
      icon: <Image src="/harbor-preview.svg" alt="" width={28} height={28} unoptimized />,
      title: t("tool_harbor_title"),
      description: t("tool_harbor_desc"),
    },
    {
      href: "/tools/github",
      icon: <GithubMark size={22} />,
      title: t("tool_github_title"),
      description: t("tool_github_desc"),
    },
    {
      href: "/tools/vercel",
      icon: <VercelMark size={22} />,
      title: t("tool_vercel_title"),
      description: t("tool_vercel_desc"),
    },
  ];

  return (
    <div className="mt-6 flex flex-col gap-3">
      {tools.map((tool) => (
        <ToolCard key={tool.href} {...tool} />
      ))}
    </div>
  );
}

