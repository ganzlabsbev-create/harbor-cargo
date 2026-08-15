"use client";

import { Github, Rocket } from "lucide-react";
import ToolCard from "./ToolCard";
import { useLang } from "@/lib/i18n-context";

// Reusable, additive grid: append a { href, icon, titleKey, descKey } entry
// here for each future tool/destination — no other file needs to change.
export default function ToolGrid() {
  const { t } = useLang();
  const tools = [
    {
      href: "/tools/github",
      icon: Github,
      title: t("tool_github_title"),
      description: t("tool_github_desc"),
    },
    {
      href: "/tools/vercel",
      icon: Rocket,
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
