/**
 * Digital Asset Links parsing/validation — powers the "Android App"
 * tool's Step 2 (paste the JSON PWABuilder generated) and Step 4 (compare
 * what's live on the domain against what was pushed).
 *
 * We don't sign anything here and never touch a keystore — PWABuilder's
 * own Android packaging already produces a fully signed apk/aab and shows
 * this exact JSON on its results page. This module only parses, validates,
 * and re-serializes that JSON so it can be committed to the user's repo at
 * /.well-known/assetlinks.json.
 */

export interface AssetLinkTarget {
  packageName: string;
  fingerprints: string[]; // "AA:BB:CC:..." — 32 colon-separated hex pairs each
}

export interface ParsedAssetLinks {
  raw: unknown[]; // the untouched parsed JSON — this is exactly what gets committed
  targets: AssetLinkTarget[]; // extracted for the preview card(s)
}

export type ParseResult = { ok: true; value: ParsedAssetLinks } | { ok: false; error: string };

const FINGERPRINT_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}$/;
const PACKAGE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/**
 * Accepts the JSON exactly as PWABuilder's Android package screen shows
 * it — an array of relation/target objects. Also tolerant of a person
 * pasting just the single `target` object by mistake (wraps it in an
 * array), since that's an easy copy-paste slip.
 */
export function parseAssetLinksJson(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  let arr: unknown[];
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object" && "target" in (parsed as any)) {
    arr = [parsed];
  } else if (parsed && typeof parsed === "object" && "package_name" in (parsed as any)) {
    // Person pasted just the innermost `target` object.
    arr = [{ relation: ["delegate_permission/common.handle_all_urls"], target: parsed }];
  } else {
    return { ok: false, error: "not_asset_links_shape" };
  }

  if (arr.length === 0) return { ok: false, error: "empty_array" };

  const targets: AssetLinkTarget[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "malformed_entry" };
    const target = (entry as any).target;
    if (!target || typeof target !== "object") return { ok: false, error: "missing_target" };

    const packageName = target.package_name;
    if (typeof packageName !== "string" || !PACKAGE_NAME_RE.test(packageName)) {
      return { ok: false, error: "invalid_package_name" };
    }

    const fingerprints = target.sha256_cert_fingerprints;
    if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
      return { ok: false, error: "missing_fingerprints" };
    }
    for (const fp of fingerprints) {
      if (typeof fp !== "string" || !FINGERPRINT_RE.test(fp)) {
        return { ok: false, error: "invalid_fingerprint" };
      }
    }

    targets.push({ packageName, fingerprints });
  }

  return { ok: true, value: { raw: arr, targets } };
}

/** Re-serializes exactly what was parsed — never hand-rebuilt — so the committed file is byte-for-byte what the person reviewed in the preview. */
export function formatAssetLinksFile(parsed: ParsedAssetLinks): string {
  return JSON.stringify(parsed.raw, null, 2) + "\n";
}

/**
 * Compares two parsed sets of targets structurally (package name + the
 * set of fingerprints, order-insensitive) — used to tell the person
 * whether what's live on their domain now matches what they pushed.
 */
export function assetLinksMatch(a: ParsedAssetLinks, b: ParsedAssetLinks): boolean {
  if (a.targets.length !== b.targets.length) return false;
  const norm = (t: AssetLinkTarget) => `${t.packageName}::${[...t.fingerprints].sort().join(",")}`;
  const setA = new Set(a.targets.map(norm));
  const setB = new Set(b.targets.map(norm));
  if (setA.size !== setB.size) return false;
  for (const v of setA) if (!setB.has(v)) return false;
  return true;
}

/** Derives the required public URL for the file from any page/site URL on the same origin. */
export function assetLinksUrlFor(siteUrl: string): string | null {
  try {
    const u = new URL(siteUrl);
    return `${u.origin}/.well-known/assetlinks.json`;
  } catch {
    return null;
  }
}
