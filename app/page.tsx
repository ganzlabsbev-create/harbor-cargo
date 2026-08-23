import type { Metadata } from "next";
import Header from "@/components/Header";
import HomeIntro from "@/components/HomeIntro";
import ToolGrid from "@/components/ToolGrid";
import RecentTools from "@/components/RecentTools";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "HARBOR CARGO — Ship Your Projects",
  description:
    "Upload a project ZIP and ship it straight to a GitHub repository or Vercel deployment — no install, works as a guest.",
  alternates: { canonical: "/" },
};

// Only fields we can actually stand behind — no rating/review/user-count
// fields, since we have no real data to back those.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "HARBOR CARGO",
  url: SITE_URL,
  description:
    "Upload a project ZIP and ship it straight to a GitHub repository or Vercel deployment — no install, works as a guest.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any (web-based)",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

/**
 * Home is just a hub: a grid of tool cards. All upload/push logic lives
 * under /tools/*. To add a future destination (Vercel, Netlify, ...),
 * add another entry to ToolGrid and a new route under app/tools/.
 */
export default function HomePage() {
  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <HomeIntro />
        <ToolGrid />
        <RecentTools />
      </div>
    </main>
  );
}
