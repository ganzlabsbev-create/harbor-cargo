import { extOf, baseName, dirName } from "./path-security";
import type { ProjectTextFile } from "./service-worker-detect";

export type ManifestConfidence = "high" | "medium" | "low";

export interface ManifestCandidate {
  path: string;
  confidence: ManifestConfidence;
  parses: boolean;
  hasManifestShape: boolean;
  linked: boolean;
  linkedFrom: string | null;
  reasons: string[];
}

export interface ExistingManifestState {
  path: string | null;
  confidence: ManifestConfidence | null;
  linked: boolean;
  linkedFrom: string | null;
  candidates: ManifestCandidate[];
  diagnostics: string[];
}

const MANIFEST_NAME_RE = /(^|\/)([\w.-]*manifest[\w.-]*\.(json|webmanifest))$/i;
const NON_RUNTIME_DIR_RE = /(^|\/)(docs?|examples?|example|tests?|__tests__|__mocks__|fixtures?|spec|specs|\.storybook|stories|demo|samples?|templates?)\//i;

// <link rel="manifest" href="...">, tolerant of attribute order/whitespace/quotes.
const HTML_LINK_RE = /<link\b[^>]*\brel=["']manifest["'][^>]*>/gi;
const HREF_ATTR_RE = /\bhref=["']([^"']+)["']/i;
// Next.js metadata export: `manifest: "/manifest.json"` (or webmanifest) inside a metadata object.
const NEXT_METADATA_MANIFEST_RE = /\bmanifest\s*:\s*["']([^"']+)["']/;
// Nuxt app.head link array entry, same shape as the HTML tag.
const NUXT_LINK_RE = /\{\s*rel:\s*["']manifest["'][^}]*href:\s*["']([^"']+)["']/;

function looksLikeManifestShape(json: unknown): boolean {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  const obj = json as Record<string, unknown>;
  const hasName = typeof obj.name === "string" || typeof obj.short_name === "string";
  const hasIcons = Array.isArray(obj.icons);
  const hasDisplayish = "display" in obj || "start_url" in obj || "background_color" in obj || "theme_color" in obj;
  return hasName && (hasIcons || hasDisplayish);
}

function resolveHref(fromDir: string, href: string): string | null {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return null;
  if (href.startsWith("/")) return href.slice(1); // root-relative: caller reconciles against asset root
  const fromParts = fromDir.split("/").filter(Boolean);
  const relParts = href.split("/").filter(Boolean);
  for (const seg of relParts) {
    if (seg === ".") continue;
    if (seg === "..") fromParts.pop();
    else fromParts.push(seg);
  }
  return fromParts.join("/");
}

interface LinkRef {
  fromFile: string;
  href: string;
  resolved: string | null;
}

function findManifestLinks(files: ProjectTextFile[]): LinkRef[] {
  const refs: LinkRef[] = [];
  for (const file of files) {
    if (file.text == null) continue;
    const ext = extOf(file.path);
    if (!["html", "htm", "tsx", "jsx", "ts", "js", "vue", "svelte", "astro"].includes(ext)) continue;

    if (ext === "html" || ext === "htm" || ext === "astro" || ext === "vue" || ext === "svelte") {
      HTML_LINK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = HTML_LINK_RE.exec(file.text))) {
        const hrefM = m[0].match(HREF_ATTR_RE);
        if (hrefM) {
          const href = hrefM[1];
          refs.push({ fromFile: file.path, href, resolved: resolveHref(dirName(file.path), href) });
        }
      }
    }

    const nextM = file.text.match(NEXT_METADATA_MANIFEST_RE);
    if (nextM) {
      refs.push({ fromFile: file.path, href: nextM[1], resolved: resolveHref(dirName(file.path), nextM[1]) });
    }
    const nuxtM = file.text.match(NUXT_LINK_RE);
    if (nuxtM) {
      refs.push({ fromFile: file.path, href: nuxtM[1], resolved: resolveHref(dirName(file.path), nuxtM[1]) });
    }
  }
  return refs;
}

function classifyFile(file: ProjectTextFile, links: LinkRef[]): ManifestCandidate | null {
  const { path, text } = file;
  const ext = extOf(path);
  if (ext !== "json" && ext !== "webmanifest") return null;
  if (!MANIFEST_NAME_RE.test(path)) return null;

  const reasons: string[] = [];
  const inNonRuntimeDir = NON_RUNTIME_DIR_RE.test(path);

  let parses = false;
  let hasManifestShape = false;
  if (text != null) {
    try {
      const json = JSON.parse(text);
      parses = true;
      hasManifestShape = looksLikeManifestShape(json);
    } catch {
      reasons.push("file does not parse as valid JSON");
    }
  } else {
    reasons.push("content could not be read to confirm");
  }

  const matchingLink = links.find((l) => l.resolved === path || (l.resolved && baseName(l.resolved) === baseName(path) && l.href.endsWith(baseName(path))));
  const linked = !!matchingLink;

  let confidence: ManifestConfidence;
  if (parses && hasManifestShape && linked) {
    confidence = "high";
    reasons.push("valid JSON, has Web App Manifest fields, and is linked from the app");
  } else if (parses && hasManifestShape && !inNonRuntimeDir) {
    confidence = "medium";
    reasons.push("valid JSON with Web App Manifest fields, but no confirmed <link rel=\"manifest\"> reference was found");
  } else if (parses && hasManifestShape && inNonRuntimeDir) {
    confidence = "low";
    reasons.push("valid manifest shape, but located under a docs/examples/tests-style directory and not linked — likely not the application's manifest");
  } else {
    confidence = "low";
    if (!hasManifestShape && parses) reasons.push("parses as JSON but does not look like a Web App Manifest (missing name/short_name + icons or display fields)");
  }

  return { path, confidence, parses, hasManifestShape, linked, linkedFrom: matchingLink?.fromFile ?? null, reasons };
}

function rank(c: ManifestCandidate): number {
  const confRank = c.confidence === "high" ? 2 : c.confidence === "medium" ? 1 : 0;
  return confRank * 10 + (c.linked ? 2 : 0) + (c.hasManifestShape ? 1 : 0);
}

export function detectManifest(files: ProjectTextFile[]): ExistingManifestState {
  const links = findManifestLinks(files);
  const candidates: ManifestCandidate[] = [];
  for (const file of files) {
    const c = classifyFile(file, links);
    if (c) candidates.push(c);
  }

  candidates.sort((a, b) => rank(b) - rank(a));
  const chosen = candidates.find((c) => c.confidence !== "low") ?? candidates[0] ?? null;

  const diagnostics: string[] = [];
  for (const c of candidates) {
    if (c === chosen) {
      diagnostics.push(`Detected manifest: ${c.path}${c.linkedFrom ? ` (linked from ${c.linkedFrom})` : " (not linked)"}`);
    } else if (c.confidence === "low") {
      diagnostics.push(`Ignored ${c.path}: ${c.reasons[c.reasons.length - 1]}`);
    }
  }

  return {
    path: chosen?.path ?? null,
    confidence: chosen?.confidence ?? null,
    linked: chosen?.linked ?? false,
    linkedFrom: chosen?.linkedFrom ?? null,
    candidates,
    diagnostics,
  };
}
