import type { Metadata } from "next";

// app/tools/harbor/pwa/page.tsx is a "use client" component, so it can't
// export `metadata` itself — this layout carries the route's metadata instead.
export const metadata: Metadata = {
  title: "PWA Converter",
  description: "Turn a static web project into an installable PWA — manifest, icons, and service worker generated in your browser.",
  alternates: { canonical: "/tools/harbor/pwa" },
};

export default function HarborPwaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
