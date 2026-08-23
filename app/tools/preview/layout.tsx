import type { Metadata } from "next";

// app/tools/preview/page.tsx is a "use client" component, so it can't export
// `metadata` itself — this layout carries the route's metadata instead.
export const metadata: Metadata = {
  title: "Preview",
  description: "Preview a project in your browser before shipping it to a GitHub repository.",
  alternates: { canonical: "/tools/preview" },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
