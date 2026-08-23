"use client";

import Image from "next/image";
import ToolCard from "./ToolCard";
import { GithubMark, VercelMark } from "./BrandIcons";
import { useLang } from "@/lib/i18n-context";
import { useSession } from "@/lib/use-session";

// Reusable, additive grid: append a { href, icon, titleKey, descKey } entry
// here for each future tool/destination — no other file needs to change.
export default function ToolGrid() {
  const { t } = useLang();
  const { user, loading } = useSession();

  // Nothing here hides GitHub/Vercel from guests — everyone sees every
  // tool. The badge just sets expectations about what happens when you
  // tap in: some tools work immediately, some ask you to sign in first.
  const authBadge = loading ? undefined : user ? undefined : t("tool_badge_login_required");

  const tools = [
    {
      href: "/tools/harbor",
      icon: <Image src="/harbor-preview.svg" alt="" width={28} height={28} unoptimized />,
      title: t("tool_harbor_title"),
      description: t("tool_harbor_desc"),
      badge: loading ? undefined : user ? undefined : t("tool_badge_ready"),
    },
    {
      href: "/tools/github",
      icon: <GithubMark size={22} />,
      title: t("tool_github_title"),
      description: t("tool_github_desc"),
      badge: authBadge,
    },
    {
      href: "/tools/vercel",
      icon: <VercelMark size={22} />,
      title: t("tool_vercel_title"),
      description: t("tool_vercel_desc"),
      badge: loading ? undefined : user ? undefined : t("tool_badge_connect_required"),
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
