import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only routes a guest can actually land on and use are listed here.
// Deliberately excluded: /login, the OAuth callback routes, and every
// operation page that's gated behind AuthGate/session
// (/tools/github/new, /tools/github/update, /tools/vercel/new,
// /tools/vercel/manage*) — none of those are meant to be indexed or
// entered directly by a search crawler. Internal API routes are excluded
// too.
const PUBLIC_PATHS = [
  "/",
  "/tools/harbor",
  "/tools/harbor/pwa",
  "/tools/preview",
  "/tools/github",
  "/tools/vercel",
  "/settings",
  "/settings/about",
  "/settings/help",
  "/settings/license",
  "/settings/privacy",
  "/settings/version",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));
}
