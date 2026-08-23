import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Thai, Space_Grotesk } from "next/font/google";
import { LangProvider } from "@/lib/i18n-context";
import { RouteTransitionProvider } from "@/lib/route-transition";
import UpdateBanner from "@/components/UpdateBanner";
import CaptainHarbor from "@/components/CaptainHarbor";
import { Analytics } from "@vercel/analytics/next";
import HarborRegisterSW from "./harbor-register-sw";
import { SITE_URL } from "@/lib/site";
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

const description =
  "Upload a project ZIP and ship it straight to a GitHub repository or Vercel deployment — no install, works as a guest.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "HARBOR CARGO — Ship Your Projects",
    template: "%s — HARBOR CARGO",
  },
  description,
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
    type: "website",
    url: "/",
    siteName: "HARBOR CARGO",
    title: "HARBOR CARGO — Ship Your Projects",
    description,
    images: [{ url: "/icons/og-image.png" }],
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
          <RouteTransitionProvider>
            {children}
            <UpdateBanner />
            {/* Rendered once at the root so the panel/conversation state
                survives client-side navigation between pages — see
                components/CaptainHarbor.tsx for why that matters. */}
            <CaptainHarbor />
          </RouteTransitionProvider>
        </LangProvider>
        <Analytics />
      <HarborRegisterSW />
      </body>
    </html>
  );
}
