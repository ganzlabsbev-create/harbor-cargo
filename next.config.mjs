/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { 
    // Vercel sets VERCEL_GIT_COMMIT_SHA automatically on every deploy, so this
    // changes on its own with no extra build step. Date.now() is only a
    // fallback for hosts that don't provide it (e.g. plain `next build`
    // locally), and still changes on every single build since this file is
    // re-evaluated fresh each time.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()),
  },
  images: {
    // Needed so <Image> can render GitHub avatars (settings page) — without
    // this, next/image silently refuses to load images from this host.
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // Harbor Preview's dev-server mode (lib/dev-server-preview.ts) boots a
  // real Node runtime in-browser via @webcontainer/api, which requires the
  // page to be cross-origin isolated (SharedArrayBuffer gate). Scoped to
  // just the preview route — applying this site-wide would need every
  // other cross-origin resource (GitHub avatars, etc.) to opt in via CORP,
  // which nothing here needs.
  async headers() {
    return [
      {
        source: "/tools/preview/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
