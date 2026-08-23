// Single source of truth for the production origin, used by
// app/layout.tsx (metadataBase/OG), app/sitemap.ts, and app/robots.ts.
// Falls back to the real production domain instead of localhost so
// metadata/sitemap/robots never resolve to a dev URL if the env var is
// missing on a deploy.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://harbor-cargo.vercel.app").replace(/\/+$/, "");
