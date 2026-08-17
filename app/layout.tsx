import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Thai, Space_Grotesk } from "next/font/google";
import { LangProvider } from "@/lib/i18n-context";
import UpdateBanner from "@/components/UpdateBanner";
import CaptainHarbor from "@/components/CaptainHarbor";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Self-hosted via next/font (downloaded + bundled at build time, no runtime
// CDN calls) per the theme spec: crisp UI body font + a bold display face,
// paired with a clean Thai face at matching weights.
const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});
const thaiFont = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-th",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HARBOR CARGO",
  description: "One harbor to ship your projects anywhere — starting with GitHub.",
  icons: {
    icon: [
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "HARBOR CARGO",
    description: "One harbor to ship your projects anywhere.",
    images: ["/icons/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#040D1A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${bodyFont.variable} ${displayFont.variable} ${thaiFont.variable}`}>
      <body className="font-sans antialiased">
        <LangProvider>
          {children}
          <UpdateBanner />
          {/* Rendered once at the root so the panel/conversation state
              survives client-side navigation between pages — see
              components/CaptainHarbor.tsx for why that matters. */}
          <CaptainHarbor />
        </LangProvider>
        <Analytics />
      </body>
    </html>
  );
}
