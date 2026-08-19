// Minimal, surgical string edits to the entry HTML — deliberately not a
// parse-and-reserialize (DOMParser -> XMLSerializer) round trip, because
// that rewrites whitespace/formatting throughout the whole document. We
// only ever insert new lines right before </head>, and only after
// confirming the same tag doesn't already exist.

export interface HtmlInjectionOptions {
  manifestHref: string;
  themeColor: string;
  appleTouchIconHref: string | null;
  swRegistrationScript: string | null;
  /** If false and a manifest/theme-color tag already exists, leave it untouched. */
  manageManifestTags: boolean;
  /** If false and a registration script already exists, don't add another one. */
  manageServiceWorker: boolean;
}

export interface HtmlInjectionResult {
  html: string;
  changed: boolean;
  headFound: boolean;
  notes: string[];
}

const HEAD_OPEN_RE = /<head[^>]*>/i;
const HEAD_CLOSE_RE = /<\/head>/i;
const MANIFEST_LINK_RE = /<link\s+[^>]*rel=["']manifest["'][^>]*>/i;
const THEME_COLOR_RE = /<meta\s+[^>]*name=["']theme-color["'][^>]*>/i;
const APPLE_ICON_RE = /<link\s+[^>]*rel=["']apple-touch-icon["'][^>]*>/i;
const SW_REGISTER_RE = /serviceWorker\s*\.\s*register\s*\(/i;

export function injectPwaHtml(html: string, opts: HtmlInjectionOptions): HtmlInjectionResult {
  const notes: string[] = [];
  const headFound = HEAD_CLOSE_RE.test(html) || HEAD_OPEN_RE.test(html);
  if (!headFound) {
    return { html, changed: false, headFound: false, notes: ["no_head_tag"] };
  }

  const additions: string[] = [];

  if (opts.manageManifestTags) {
    if (!MANIFEST_LINK_RE.test(html)) {
      additions.push(`<link rel="manifest" href="${opts.manifestHref}">`);
    } else {
      notes.push("manifest_link_exists");
    }
    if (!THEME_COLOR_RE.test(html)) {
      additions.push(`<meta name="theme-color" content="${opts.themeColor}">`);
    } else {
      notes.push("theme_color_exists");
    }
    if (opts.appleTouchIconHref && !APPLE_ICON_RE.test(html)) {
      additions.push(`<link rel="apple-touch-icon" href="${opts.appleTouchIconHref}">`);
    }
  } else {
    notes.push("manifest_tags_skipped_by_user");
  }

  if (opts.swRegistrationScript && opts.manageServiceWorker) {
    if (!SW_REGISTER_RE.test(html)) {
      additions.push(opts.swRegistrationScript);
    } else {
      notes.push("sw_registration_exists");
    }
  } else if (opts.swRegistrationScript) {
    notes.push("sw_registration_skipped_by_user");
  }

  if (additions.length === 0) {
    return { html, changed: false, headFound: true, notes };
  }

  const block = `  ${additions.join("\n  ")}\n`;
  let next: string;
  if (HEAD_CLOSE_RE.test(html)) {
    next = html.replace(HEAD_CLOSE_RE, (m) => `${block}${m}`);
  } else {
    // Extremely rare: a <head> with no closing tag. Insert right after it.
    next = html.replace(HEAD_OPEN_RE, (m) => `${m}\n${block}`);
  }

  return { html: next, changed: true, headFound: true, notes };
}
