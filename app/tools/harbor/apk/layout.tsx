import type { Metadata } from "next";

// app/tools/harbor/apk/page.tsx is a "use client" component, so it can't
// export `metadata` itself — this layout carries the route's metadata instead.
export const metadata: Metadata = {
  title: "Android App Identity",
  description:
    "Get the signed Android package from PWABuilder, then push its Digital Asset Links (assetlinks.json) straight into your repo so the app opens without a browser address bar.",
  alternates: { canonical: "/tools/harbor/apk" },
};

export default function HarborApkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
