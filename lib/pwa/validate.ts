/**
 * OutputValidator — Phase 4 §2.
 *
 * Runs after mutation and before the result is packaged into a ZIP. It never
 * mutates anything; it only inspects the final file set (and compares it
 * against the original files + mutation plan) and reports problems.
 *
 * Deliberately reuses the same relationship-first detectors used during
 * analysis (detectManifest / detectServiceWorker) instead of re-deriving a
 * second, possibly-divergent notion of "what is the manifest / what is the
 * service worker" — post-generation validation should ask the exact same
 * question the analyzer would ask if it saw this output as a fresh upload.
 *
 * §17 checklist covered here: OutputValidator runs before ZIP; unexpected
 * mutations are caught; manifest/icon consistency is validated; a failed
 * validation never produces a "successful generation" result.
 */
import type { ClientFile } from "@/lib/client-zip";
import type { MutationPlanEntry, ValidationIssue } from "./types";
import { detectServiceWorker, type ProjectTextFile } from "./detect/service-worker-detect";
import { normalizeEntryPath, isCaseCollision, dirName, baseName } from "./detect/path-security";

export type { ValidationIssue } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const dec = new TextDecoder("utf-8");

function err(code: string, detail: string, path?: string): ValidationIssue {
  return { severity: "error", code, path, detail };
}
function warn(code: string, detail: string, path?: string): ValidationIssue {
  return { severity: "warning", code, path, detail };
}

function toText(file: ClientFile): string | null {
  const textLikeExt = new Set(["json", "webmanifest", "html", "htm", "js", "mjs", "ts", "tsx", "jsx", "vue", "svelte", "astro", "css"]);
  if (!textLikeExt.has(file.ext)) return null;
  try {
    return dec.decode(file.bytes);
  } catch {
    return null;
  }
}

function toProjectTextFiles(byPath: Map<string, ClientFile>): ProjectTextFile[] {
  return [...byPath.values()].map((f) => ({ path: f.path, text: toText(f) }));
}

/** Resolve a manifest icon `src` (root-relative "/...", relative "../...", or
 * external/inline) against the manifest's own location, so validation checks
 * the same file the browser would actually fetch. Returns null for anything
 * that isn't a project-local path (external URLs, data URIs) — those are out
 * of scope for filesystem validation. */
export function resolveIconSrc(manifestPath: string, src: string, assetRoot: string): string | null {
  if (!src) return null;
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return null;
  if (src.startsWith("/")) {
    const rel = src.slice(1);
    return assetRoot ? `${assetRoot.replace(/\/$/, "")}/${rel}` : rel;
  }
  const parts = dirName(manifestPath).split("/").filter(Boolean);
  for (const seg of src.split("/").filter(Boolean)) {
    if (seg === ".") continue;
    else if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

// ---------------------------------------------------------------------------
// 2.1 Filesystem validation
// ---------------------------------------------------------------------------

export function validateFilesystem(
  plan: MutationPlanEntry[],
  originalByPath: Map<string, ClientFile>,
  finalByPath: Map<string, ClientFile>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Every path in the final set must be a normalized, non-traversal,
  // in-root path. (Defense in depth — the ZIP extractor already enforces
  // this on the way in, but generated paths are constructed by our own
  // code and deserve the same scrutiny.)
  const seenNormalized = new Map<string, string>(); // normalized -> original
  for (const path of finalByPath.keys()) {
    const normalized = normalizeEntryPath(path);
    if (normalized === null || normalized !== path) {
      issues.push(err("unsafe_path", `generated/final path is not a safe, normalized project-relative path: "${path}"`, path));
      continue;
    }
    for (const [otherNorm, otherPath] of seenNormalized) {
      if (isCaseCollision(otherNorm, normalized)) {
        issues.push(err("case_collision", `"${path}" and "${otherPath}" differ only by case — unsafe on case-insensitive filesystems`, path));
      }
    }
    seenNormalized.set(normalized, path);
  }

  // Every CREATE/UPDATE target the plan declares must actually exist in the
  // final output.
  for (const entry of plan) {
    if ((entry.action === "CREATE" || entry.action === "UPDATE") && !finalByPath.has(entry.path)) {
      issues.push(err("planned_write_missing", `plan says ${entry.action} "${entry.path}" but that file is not present in the final output`, entry.path));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 3. Mutation plan enforcement — planned vs actual
// ---------------------------------------------------------------------------

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function validateMutationPlan(
  plan: MutationPlanEntry[],
  originalByPath: Map<string, ClientFile>,
  finalByPath: Map<string, ClientFile>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const planByPath = new Map(plan.map((e) => [e.path, e]));

  // actual diff between original and final
  const actualCreated = new Set<string>();
  const actualUpdated = new Set<string>();
  for (const [path, file] of finalByPath) {
    const orig = originalByPath.get(path);
    if (!orig) {
      actualCreated.add(path);
    } else if (!bytesEqual(orig.bytes, file.bytes)) {
      actualUpdated.add(path);
    }
  }

  // Every actual change must be authorized by the plan.
  for (const path of actualCreated) {
    const entry = planByPath.get(path);
    if (!entry) {
      issues.push(err("unplanned_create", `"${path}" was created but has no mutation-plan entry`, path));
    } else if (entry.action !== "CREATE") {
      issues.push(err("plan_mismatch", `"${path}" was created but plan says ${entry.action}`, path));
    }
  }
  for (const path of actualUpdated) {
    const entry = planByPath.get(path);
    if (!entry) {
      issues.push(err("unplanned_update", `"${path}" was modified but has no mutation-plan entry`, path));
    } else if (entry.action === "PRESERVE") {
      issues.push(err("preserve_violated", `plan says PRESERVE "${path}" but the file was modified`, path));
    } else if (entry.action === "SKIP") {
      issues.push(err("skip_violated", `plan says SKIP "${path}" but the file was modified`, path));
    } else if (entry.action !== "UPDATE") {
      issues.push(err("plan_mismatch", `"${path}" was modified but plan says ${entry.action}`, path));
    }
  }

  // Every planned CREATE/UPDATE should correspond to an actual change.
  for (const entry of plan) {
    if (entry.action === "CREATE" && !actualCreated.has(entry.path)) {
      if (finalByPath.has(entry.path) && originalByPath.has(entry.path)) {
        issues.push(warn("planned_create_already_existed", `plan says CREATE "${entry.path}" but a file already existed there before mutation`, entry.path));
      } else if (!finalByPath.has(entry.path)) {
        issues.push(err("planned_create_missing", `plan says CREATE "${entry.path}" but no such file exists in the final output`, entry.path));
      }
    }
    if (entry.action === "UPDATE" && !actualUpdated.has(entry.path) && !actualCreated.has(entry.path)) {
      if (!finalByPath.has(entry.path)) {
        issues.push(err("planned_update_missing", `plan says UPDATE "${entry.path}" but no such file exists in the final output`, entry.path));
      } else {
        // Unchanged bytes after a planned UPDATE is only acceptable when the
        // update was idempotent (e.g. re-injecting a tag that was already
        // present) — surfaced as a warning rather than an error, since it's
        // not evidence of a mutation escaping the plan's authorization.
        issues.push(warn("planned_update_no_change", `plan says UPDATE "${entry.path}" but the file is byte-identical to the original — acceptable only if the update was idempotent`, entry.path));
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 2.2 Manifest validation
// ---------------------------------------------------------------------------

export function validateManifest(manifestPath: string | null, finalByPath: Map<string, ClientFile>, assetRoot: string): ValidationIssue[] {
  if (!manifestPath) return [];
  const issues: ValidationIssue[] = [];
  const file = finalByPath.get(manifestPath);
  if (!file) {
    issues.push(err("manifest_missing", `manifest "${manifestPath}" does not exist in the final output`, manifestPath));
    return issues;
  }
  // Next.js app/manifest.ts is a TS module, not JSON — nothing to parse here.
  if (file.ext === "ts" || file.ext === "js" || file.ext === "mjs") return issues;

  let text: string;
  try {
    text = dec.decode(file.bytes);
  } catch {
    issues.push(err("manifest_undecodable", `manifest "${manifestPath}" could not be decoded as text`, manifestPath));
    return issues;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    issues.push(err("manifest_invalid_json", `manifest "${manifestPath}" is not valid JSON: ${(e as Error).message}`, manifestPath));
    return issues;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    issues.push(err("manifest_not_object", `manifest "${manifestPath}" does not parse to a JSON object`, manifestPath));
    return issues;
  }
  const obj = json as Record<string, unknown>;

  if ("name" in obj && typeof obj.name !== "string") {
    issues.push(err("manifest_bad_field_type", `manifest "name" must be a string`, manifestPath));
  }
  if ("short_name" in obj && typeof obj.short_name !== "string") {
    issues.push(err("manifest_bad_field_type", `manifest "short_name" must be a string`, manifestPath));
  }
  if ("start_url" in obj && typeof obj.start_url !== "string") {
    issues.push(err("manifest_bad_field_type", `manifest "start_url" must be a string`, manifestPath));
  }
  if ("scope" in obj && typeof obj.scope !== "string") {
    issues.push(err("manifest_bad_field_type", `manifest "scope" must be a string`, manifestPath));
  }

  if ("icons" in obj) {
    if (!Array.isArray(obj.icons)) {
      issues.push(err("manifest_icons_not_array", `manifest "icons" must be an array`, manifestPath));
    } else {
      const seenSrc = new Set<string>();
      for (const iconRaw of obj.icons) {
        if (typeof iconRaw !== "object" || iconRaw === null) {
          issues.push(err("manifest_icon_malformed", `manifest icon entry is not an object`, manifestPath));
          continue;
        }
        const icon = iconRaw as Record<string, unknown>;
        const src = typeof icon.src === "string" ? icon.src : null;
        if (!src) {
          issues.push(err("manifest_icon_missing_src", `manifest icon entry is missing a "src"`, manifestPath));
          continue;
        }
        if (seenSrc.has(src)) {
          issues.push(warn("manifest_icon_duplicate", `manifest references icon "${src}" more than once`, manifestPath));
        }
        seenSrc.add(src);

        const resolved = resolveIconSrc(manifestPath, src, assetRoot);
        if (resolved && !finalByPath.has(resolved)) {
          issues.push(err("manifest_icon_missing_file", `manifest references icon "${src}" but no such file exists at "${resolved}"`, manifestPath));
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 2.3 Service worker validation
// ---------------------------------------------------------------------------

export function validateServiceWorker(finalByPath: Map<string, ClientFile>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const state = detectServiceWorker(toProjectTextFiles(finalByPath));

  for (const reg of state.registrations) {
    if (reg.targetLiteral === null) continue; // dynamic expression — nothing to resolve, not an error
    const target = reg.resolvedTarget ?? reg.targetLiteral;
    const exists = finalByPath.has(target) || [...finalByPath.keys()].some((p) => baseName(p) === baseName(target));
    if (!exists) {
      issues.push(err("sw_registration_target_missing", `registration in "${reg.path}" points at "${reg.targetLiteral}" but no such Service Worker file exists in the final output`, reg.path));
    }
  }

  // Duplicate Harbor-added registrations in the same file.
  const byFile = new Map<string, number>();
  for (const reg of state.registrations) {
    byFile.set(reg.path, (byFile.get(reg.path) ?? 0) + 1);
  }
  for (const [path, count] of byFile) {
    if (count > 1) {
      issues.push(warn("sw_duplicate_registration", `"${path}" contains ${count} navigator.serviceWorker.register() calls`, path));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 2.4 HTML / source validation
// ---------------------------------------------------------------------------

const MANIFEST_LINK_G_RE = /<link\s+[^>]*rel=["']manifest["'][^>]*>/gi;
const SW_REGISTER_G_RE = /navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(/g;

export function validateHtml(entryPath: string | null, finalByPath: Map<string, ClientFile>): ValidationIssue[] {
  if (!entryPath) return [];
  const file = finalByPath.get(entryPath);
  if (!file) return [];
  if (!["html", "htm"].includes(file.ext)) return [];

  const issues: ValidationIssue[] = [];
  let text: string;
  try {
    text = dec.decode(file.bytes);
  } catch {
    return issues;
  }

  const manifestLinks = text.match(MANIFEST_LINK_G_RE) ?? [];
  if (manifestLinks.length > 1) {
    issues.push(err("duplicate_manifest_link", `"${entryPath}" has ${manifestLinks.length} <link rel="manifest"> tags`, entryPath));
  }
  const swRegs = text.match(SW_REGISTER_G_RE) ?? [];
  if (swRegs.length > 1) {
    issues.push(err("duplicate_sw_registration", `"${entryPath}" registers a Service Worker ${swRegs.length} times`, entryPath));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export interface ValidateOutputInputs {
  plan: MutationPlanEntry[];
  originalFiles: ClientFile[];
  finalByPath: Map<string, ClientFile>;
  manifestPath: string | null;
  entryHtmlPath: string | null;
  assetRoot: string;
}

export function validateOutput(inputs: ValidateOutputInputs): ValidationResult {
  const originalByPath = new Map(inputs.originalFiles.map((f) => [f.path, f]));
  const issues: ValidationIssue[] = [
    ...validateFilesystem(inputs.plan, originalByPath, inputs.finalByPath),
    ...validateMutationPlan(inputs.plan, originalByPath, inputs.finalByPath),
    ...validateManifest(inputs.manifestPath, inputs.finalByPath, inputs.assetRoot),
    ...validateServiceWorker(inputs.finalByPath),
    ...validateHtml(inputs.entryHtmlPath, inputs.finalByPath),
  ];

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Thrown by generatePwaPackage when OutputValidator finds a hard error.
 * The caller's original `files` array is never mutated by generatePwaPackage
 * (mutation happens on a fresh Map copy), so catching this is itself the
 * rollback — nothing needs to be undone.
 */
export class PwaValidationError extends Error {
  readonly result: ValidationResult;
  constructor(result: ValidationResult) {
    super(`PWA output validation failed: ${result.errors.map((e) => e.code).join(", ")}`);
    this.name = "PwaValidationError";
    this.result = result;
  }
}
