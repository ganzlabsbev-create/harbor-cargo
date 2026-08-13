/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID || String(Date.now()),
  },
  images: {
    // Needed so <Image> can render GitHub avatars (settings page) — without
    // this, next/image silently refuses to load images from this host.
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
