/**
 * Central utility for building the public URL of a generated PWA asset
 * (manifest, service worker, icon) given the app's deployment base path.
 *
 * Every strategy that needs to reference "/service-worker.js",
 * "/manifest.webmanifest", or "/icons/..." from generated source/markup
 * MUST go through resolvePublicPath() instead of concatenating strings by
 * hand, so that a future framework base path (Vite `base: "/myapp/"`,
 * Next `basePath`, Astro `base`, etc.) only has to be threaded into one
 * place to take effect everywhere.
 *
 * NOTE (Phase 2, this pass): no strategy currently detects a non-root base
 * path yet — ProjectAnalysis has no basePath field. resolvePublicPath()
 * therefore always resolves against "/" today. That is a known, documented
 * gap (see Phase 2 report), not a silent limitation: once a strategy starts
 * populating a real base path, everything routed through this function
 * picks it up automatically with no further call-site changes.
 */

/** Normalizes a base path the way each framework's own bundler would treat
 * it: always a single leading slash, always a single trailing slash, no
 * double slashes, "" treated the same as "/". */
export function normalizeBasePath(base: string | null | undefined): string {
  if (!base) return "/";
  let b = base.trim();
  if (b === "") return "/";
  // collapse any run of slashes
  b = b.replace(/\/+/g, "/");
  if (!b.startsWith("/")) b = "/" + b;
  if (!b.endsWith("/")) b = b + "/";
  return b;
}

/**
 * Resolves an asset's root-relative path (e.g. "service-worker.js",
 * "/icons/icon-192.png") against a base path, producing the absolute public
 * URL the browser/manifest/HTML should reference.
 *
 * resolvePublicPath("/", "service-worker.js")       -> "/service-worker.js"
 * resolvePublicPath("/myapp/", "service-worker.js")  -> "/myapp/service-worker.js"
 * resolvePublicPath("/myapp/", "/icons/icon-192.png") -> "/myapp/icons/icon-192.png"
 */
export function resolvePublicPath(base: string | null | undefined, assetPath: string): string {
  const normalizedBase = normalizeBasePath(base);
  const cleanAsset = assetPath.replace(/^\/+/, "");
  return normalizedBase + cleanAsset;
}
