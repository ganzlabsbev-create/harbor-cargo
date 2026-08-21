// If the target project has its own middleware.ts doing a session-cookie
// (or any other) auth gate over every route, the manifest and service
// worker Harbor PWA just wired up need to be reachable *without* a
// session — Chrome evaluates PWA installability by fetching them directly,
// including before the user has ever logged in. A redirect-to-/login
// response there makes Chrome's install-eligibility check fail, and that
// negative result is cached — so the "Install app" button can stay missing
// even after the user does log in later, until the cache clears.
//
// This module never assumes Harbor Cargo's own PUBLIC_PATHS shape (see
// detect/middleware-detect.ts) — it detects whatever public-path allowlist
// pattern the *target* project already uses and extends it in place.

import { findPublicPathList } from "./detect/middleware-detect";

export interface MiddlewarePatchResult {
  code: string;
  changed: boolean;
  /** Name of the allowlist array that was extended, if any. */
  varName: string | null;
  /** Paths actually added (already-public paths are skipped). */
  addedPaths: string[];
  /** Machine keys, same convention as GenerateResult.manualSteps. */
  notes: string[];
}

/** Extends the target project's existing public-path allowlist (if one can
 * be confidently identified) with any of `pathsToEnsurePublic` it doesn't
 * already contain. Never invents a new allowlist and never touches
 * `config.matcher` or other auth-gate shapes it doesn't recognize — those
 * are surfaced as a manual step instead of a guessed edit. */
export function patchMiddlewarePublicPaths(code: string, pathsToEnsurePublic: string[]): MiddlewarePatchResult {
  const list = findPublicPathList(code);
  if (!list) {
    return { code, changed: false, varName: null, addedPaths: [], notes: ["middleware_no_public_path_list_found"] };
  }

  const missing = pathsToEnsurePublic.filter((p) => !list.existingPaths.includes(p));
  if (missing.length === 0) {
    return { code, changed: false, varName: list.varName, addedPaths: [], notes: ["middleware_paths_already_public"] };
  }

  const q = list.quote;
  const isMultiline = list.body.includes("\n");
  let insertion: string;

  if (isMultiline) {
    // Reuse the indentation of the last non-empty existing entry line so the
    // inserted lines match the file's own style instead of Harbor PWA's.
    const lines = list.body.split("\n");
    let indent = "  ";
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.trim().length > 0) {
        indent = line.slice(0, line.length - line.trimStart().length);
        break;
      }
    }
    const trimmedBody = list.body.replace(/\s+$/, "");
    const needsComma = trimmedBody.length > 0 && !trimmedBody.endsWith(",");
    const newLines = missing.map((p) => `${indent}${q}${p}${q},`).join("\n");
    insertion = `${trimmedBody}${needsComma ? "," : ""}\n${newLines}\n`;
  } else {
    const trimmedBody = list.body.trim();
    const newEntries = missing.map((p) => `${q}${p}${q}`).join(", ");
    insertion = trimmedBody.length > 0 ? `${trimmedBody}, ${newEntries}` : newEntries;
  }

  const patchedCode = code.slice(0, list.bodyStart) + insertion + code.slice(list.bodyEnd);
  return { code: patchedCode, changed: true, varName: list.varName, addedPaths: missing, notes: [] };
}
