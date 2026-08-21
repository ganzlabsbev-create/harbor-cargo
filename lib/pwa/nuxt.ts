// Nuxt 3 has no literal <head> either — global head tags live in
// nuxt.config's `app.head`. Harbor PWA merges a PWA-related head block into
// the config, but must never blindly inject a new top-level `app: { ... }`
// block: if the project already has one (very common — most real Nuxt
// configs set app.head.title, app.head.meta, etc.), a naive insertion
// creates a duplicate `app` key, which either breaks the build or silently
// overwrites the user's own config depending on how it evaluates.
//
// Approach: a small brace-aware scanner (not a full JS/AST parser — Nuxt
// config isn't a project dependency here, and the Phase 3 rules say not to
// add one) that can locate a top-level key inside an object literal while
// correctly skipping over strings, template literals, and comments. This is
// enough to find (or safely conclude we can't find) `app`, `app.head`,
// `app.head.meta`, and `app.head.link` without misreading a brace that's
// actually inside a string. If at any point the shape can't be resolved
// with confidence, the patch is refused and the original file is preserved
// untouched — never a guess.

import type { PwaFormState } from "./types";

const MARKER = "/* harbor-pwa-head */";
const OPEN_RE = /(defineNuxtConfig\s*\(\s*\{|export\s+default\s*\{)/;

export interface ConfigPatchResult {
  code: string;
  changed: boolean;
  notes: string[];
}

/** Finds the index of the brace/bracket that matches the one at `openIdx`
 * (code[openIdx] must be openCh), skipping over string/template literals
 * and comments. Returns -1 if unbalanced or unterminated — callers must
 * treat that as "can't safely parse this file", not "no match". */
function matchDelimiter(code: string, openIdx: number, openCh: string, closeCh: string): number {
  let depth = 0;
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    const prev = code[i - 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "/" && prev === "*") inBlockComment = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") { inLineComment = true; continue; }
    if (ch === "/" && code[i + 1] === "*") { inBlockComment = true; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }

    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface KeyMatch {
  /** Index of the value's first non-whitespace character. */
  valueStart: number;
}

/** Finds a `keyName:` property at the top level of the object body
 * `code.slice(bodyStart, bodyEnd)` — i.e. not nested inside a further
 * object/array/paren within that range, and not inside a string or
 * comment. Matches both bare identifiers (`app:`) and quoted keys
 * (`"app":`, `'app':`). Returns null if not found (not an error — an
 * absent key is a normal, expected case, unlike an unparseable file). */
function findTopLevelKey(code: string, bodyStart: number, bodyEnd: number, keyName: string): KeyMatch | null {
  let depth = 0;
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9_$]/.test(c);

  for (let i = bodyStart; i < bodyEnd; i++) {
    const ch = code[i];
    const prev = code[i - 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "/" && prev === "*") inBlockComment = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") { inLineComment = true; continue; }
    if (ch === "/" && code[i + 1] === "*") { inBlockComment = true; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }

    if (ch === "{" || ch === "[" || ch === "(") { depth++; continue; }
    if (ch === "}" || ch === "]" || ch === ")") { depth--; continue; }

    if (depth !== 0) continue;

    let matchedKeyEnd = -1;
    if ((ch === '"' && code.slice(i, i + keyName.length + 2) === `"${keyName}"`) ||
        (ch === "'" && code.slice(i, i + keyName.length + 2) === `'${keyName}'`)) {
      matchedKeyEnd = i + keyName.length + 2;
    } else if (code.startsWith(keyName, i) && !isWordChar(prev) && !isWordChar(code[i + keyName.length])) {
      matchedKeyEnd = i + keyName.length;
    }

    if (matchedKeyEnd !== -1) {
      let j = matchedKeyEnd;
      while (j < bodyEnd && /\s/.test(code[j])) j++;
      if (code[j] === ":") {
        let v = j + 1;
        while (v < bodyEnd && /\s/.test(code[v])) v++;
        return { valueStart: v };
      }
    }
  }
  return null;
}

/**
 * Merges Harbor PWA's theme-color meta tag and manifest/apple-touch-icon
 * link tags into the project's Nuxt config, preserving anything already
 * there. Cases handled, in order of preference:
 *
 *  1. No top-level `app` key at all -> insert a fresh `app: { head: {...} }`
 *     block (the old, always-safe case).
 *  2. `app` exists but its value isn't a plain object literal (e.g. a
 *     spread, a variable reference) -> refuse, can't safely merge into it.
 *  3. `app` exists with no `head` key -> insert `head: {...}` inside the
 *     existing app object, preserving its other properties untouched.
 *  4. `app.head` exists but isn't a plain object -> refuse.
 *  5. `app.head` exists as an object -> merge `meta`/`link` entries into
 *     existing arrays (only entries not already present, checked by a
 *     content match against the array's current text — never duplicated),
 *     or add the `meta`/`link` keys if they're missing entirely.
 *
 * Any shape this scanner can't confidently resolve (mismatched braces,
 * `app`/`head` not present as a plain object) returns changed:false with an
 * explanatory note — original file preserved byte-for-byte.
 */
export function patchNuxtConfigHead(code: string, form: PwaFormState, manifestHref: string, appleIconHref: string): ConfigPatchResult {
  if (code.includes(MARKER)) {
    return { code, changed: false, notes: ["nuxt_head_already_patched"] };
  }

  const openMatch = code.match(OPEN_RE);
  if (!openMatch || openMatch.index === undefined) {
    return { code, changed: false, notes: ["nuxt_config_shape_not_recognized"] };
  }
  const rootBraceIdx = openMatch.index + openMatch[0].length - 1; // "{" is the match's last char
  const rootBodyStart = rootBraceIdx + 1;
  const rootBodyEnd = matchDelimiter(code, rootBraceIdx, "{", "}");
  if (rootBodyEnd === -1) {
    return { code, changed: false, notes: ["nuxt_config_shape_not_recognized"] };
  }

  const metaEntry = `{ name: "theme-color", content: ${JSON.stringify(form.themeColor)} }`;
  const linkEntries = [
    { probe: /rel\s*:\s*["']manifest["']/, text: `{ rel: "manifest", href: ${JSON.stringify(manifestHref)} }` },
    { probe: /apple-touch-icon/, text: `{ rel: "apple-touch-icon", href: ${JSON.stringify(appleIconHref)} }` },
  ];
  const metaProbe = /theme-color/;

  const appKey = findTopLevelKey(code, rootBodyStart, rootBodyEnd, "app");

  // Case 1: no existing `app` key — safe to insert the whole block fresh.
  if (!appKey) {
    const block = `\n  ${MARKER}\n  app: {\n    head: {\n      meta: [${metaEntry}],\n      link: [\n        ${linkEntries[0].text},\n        ${linkEntries[1].text},\n      ],\n    },\n  },`;
    return { code: code.slice(0, rootBodyStart) + block + code.slice(rootBodyStart), changed: true, notes: [] };
  }

  if (code[appKey.valueStart] !== "{") {
    return { code, changed: false, notes: ["nuxt_config_app_not_object"] };
  }
  const appBraceIdx = appKey.valueStart;
  const appBodyStart = appBraceIdx + 1;
  const appBodyEnd = matchDelimiter(code, appBraceIdx, "{", "}");
  if (appBodyEnd === -1) {
    return { code, changed: false, notes: ["nuxt_config_shape_not_recognized"] };
  }

  const headKey = findTopLevelKey(code, appBodyStart, appBodyEnd, "head");

  // Case 3: `app` exists, no `head` key inside it — insert head, preserve everything else in app.
  if (!headKey) {
    const block = `\n    ${MARKER}\n    head: {\n      meta: [${metaEntry}],\n      link: [\n        ${linkEntries[0].text},\n        ${linkEntries[1].text},\n      ],\n    },`;
    return { code: code.slice(0, appBodyStart) + block + code.slice(appBodyStart), changed: true, notes: [] };
  }

  if (code[headKey.valueStart] !== "{") {
    return { code, changed: false, notes: ["nuxt_config_head_not_object"] };
  }
  const headBraceIdx = headKey.valueStart;
  const headBodyStart = headBraceIdx + 1;
  const headBodyEnd = matchDelimiter(code, headBraceIdx, "{", "}");
  if (headBodyEnd === -1) {
    return { code, changed: false, notes: ["nuxt_config_shape_not_recognized"] };
  }

  // Collect edits as {at, text} and apply from the end backward so earlier
  // indices stay valid — avoids fragile running-offset bookkeeping across
  // multiple insertions into the same string.
  const edits: Array<{ at: number; text: string }> = [];
  const notes: string[] = [];
  let markerPlaced = false;
  const markerPrefix = (): string => {
    if (markerPlaced) return "";
    markerPlaced = true;
    return `${MARKER}\n      `;
  };

  function mergeArrayKey(keyName: string, wantedItems: Array<{ probe: RegExp; text: string }>) {
    if (wantedItems.length === 0) return;
    const key = findTopLevelKey(code, headBodyStart, headBodyEnd, keyName);
    if (key && code[key.valueStart] === "[") {
      const arrOpen = key.valueStart;
      const arrClose = matchDelimiter(code, arrOpen, "[", "]");
      if (arrClose === -1) {
        notes.push(`nuxt_config_${keyName}_shape_not_recognized`);
        return;
      }
      const existingText = code.slice(arrOpen + 1, arrClose);
      const isEmpty = /^\s*$/.test(existingText);
      const insertion = wantedItems.map((m) => m.text).join(", ");
      edits.push({ at: arrClose, text: isEmpty ? `${markerPrefix()}${insertion}` : `, ${insertion}` });
      return;
    }
    if (key) {
      // key exists but isn't a plain array literal — don't guess, just skip
      // this specific addition and report it.
      notes.push(`nuxt_config_${keyName}_not_array`);
      return;
    }
    // key missing entirely — insert a fresh `keyName: [...]` prop.
    edits.push({ at: headBodyStart, text: `\n      ${markerPrefix()}${keyName}: [${wantedItems.map((m) => m.text).join(", ")}],` });
  }

  const headBodyText = code.slice(headBodyStart, headBodyEnd);
  const missingMeta = metaProbe.test(headBodyText) ? [] : [{ probe: metaProbe, text: metaEntry }];
  const missingLinks = linkEntries.filter((e) => !e.probe.test(headBodyText));
  if (missingMeta.length === 0) notes.push("nuxt_config_meta_already_present");
  if (missingLinks.length === 0 && linkEntries.every((e) => e.probe.test(headBodyText))) notes.push("nuxt_config_link_already_present");

  mergeArrayKey("meta", missingMeta);
  mergeArrayKey("link", missingLinks);

  if (edits.length === 0) {
    return { code, changed: false, notes: notes.length ? notes : ["nuxt_head_already_patched"] };
  }

  edits.sort((a, b) => b.at - a.at);
  let next = code;
  for (const edit of edits) {
    next = next.slice(0, edit.at) + edit.text + next.slice(edit.at);
  }
  return { code: next, changed: true, notes };
}

export function generateNuxtSwPlugin(swHref: string): string {
  const escaped = swHref.replace(/'/g, "\\'");
  return `// Generated by Harbor PWA — registers the service worker on the client.
export default defineNuxtPlugin(() => {
  if (import.meta.client && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register('${escaped}').catch(() => {});
    });
  }
});
`;
}
