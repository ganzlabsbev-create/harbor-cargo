import type { Metadata } from "next";

// app/tools/harbor/page.tsx is a "use client" component, so it can't export
// `metadata` itself — this layout carries the route's metadata instead.
export const metadata: Metadata = {
  title: "Harbor Tools",
  description: "Preview a project in your browser or turn it into an installable PWA — all client-side, no server required.",
  alternates: { canonical: "/tools/harbor" },
};

export default function HarborToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
