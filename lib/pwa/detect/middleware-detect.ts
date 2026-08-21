/**
 * Detects a target project's own root middleware.ts/js (Next.js's
 * auth-gate convention — a middleware() function that runs before every
 * matched route) and, generically, whatever "public path allowlist" array
 * it already declares — regardless of naming convention (PUBLIC_PATHS,
 * publicRoutes, WHITELIST, custom cookie names, NextAuth-flavored names,
 * ...). Harbor PWA never assumes a single fixed auth pattern here: every
 * target project it converts is someone else's codebase.
 *
 * Scope: only the flat `const NAME = ["/a", "/b"]` string-array pattern is
 * recognized. That covers the overwhelming majority of hand-rolled
 * middleware auth gates (including Harbor Cargo's own, see /middleware.ts).
 * A project whose gate is expressed some other way (a matcher-only regex,
 * a callback-based authorized() function, etc.) has no such array to find —
 * findPublicPathList() returns null and the caller must fall back to a
 * manual step instead of guessing at unfamiliar structure.
 */

/** Only Next.js has this root-level file convention, so the file's mere
 * presence is itself the framework signal — no need to already know the
 * project is Next.js before looking for it. */
const MIDDLEWARE_CANDIDATES = [
  "middleware.ts",
  "middleware.js",
  "middleware.tsx",
  "src/middleware.ts",
  "src/middleware.js",
  "src/middleware.tsx",
];

export function findMiddlewarePath(byPath: { has(path: string): boolean }): string | null {
  for (const candidate of MIDDLEWARE_CANDIDATES) {
    if (byPath.has(candidate)) return candidate;
  }
  return null;
}

export interface PublicPathListMatch {
  /** Offset in `code` right after the array's opening "[". */
  bodyStart: number;
  /** Offset in `code` right before the array's closing "]". */
  bodyEnd: number;
  /** Raw text between the brackets, unmodified. */
  body: string;
  /** Name of the const/let/var the array is assigned to, for diagnostics. */
  varName: string;
  /** Quote style used by the array's existing entries ("'" or '"' or "`"). */
  quote: string;
  /** Path-looking string literals ("/..." ) already present in the array. */
  existingPaths: string[];
}

const NAME_HINT_RE = /public|whitelist|allow|bypass|unprotected|no.?auth|open.?path|exclude|skip/i;

// Matches a flat `(export )?(const|let|var) NAME (: Type)? = [ ...body... ]`
// declaration. Deliberately excludes nested brackets from the body so one
// array can't accidentally swallow a sibling declaration below it.
const ARRAY_DECL_RE = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*\[([^[\]]*)\]/g;

function extractStringLiterals(body: string): { value: string; quote: string }[] {
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const out: { value: string; quote: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out.push({ value: m[2], quote: m[1] });
  }
  return out;
}

/**
 * Finds the best candidate "public path allowlist" array in a middleware
 * source file. Two-tier heuristic:
 *   1. Prefer an array whose variable name hints at its purpose (PUBLIC_*,
 *      WHITELIST, ALLOW*, NO_AUTH*, ...) and contains at least one
 *      path-looking ("/...") string entry.
 *   2. Otherwise, fall back to the first array where *every* entry is a
 *      path-looking string — a strong structural signal even without a
 *      recognizable name.
 * Returns null if neither is found, rather than guessing.
 */
export function findPublicPathList(code: string): PublicPathListMatch | null {
  ARRAY_DECL_RE.lastIndex = 0;
  let named: RegExpExecArray | null = null;
  let structural: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = ARRAY_DECL_RE.exec(code))) {
    const [, varName, body] = m;
    const entries = extractStringLiterals(body);
    if (entries.length === 0) continue;
    const pathLike = entries.filter((e) => e.value.startsWith("/"));
    if (pathLike.length === 0) continue;

    if (!named && NAME_HINT_RE.test(varName)) {
      named = m;
    } else if (!structural && pathLike.length === entries.length) {
      structural = m;
    }
  }

  const chosen = named || structural;
  if (!chosen) return null;

  const [full, varName, body] = chosen;
  const entries = extractStringLiterals(body);
  const quote = entries[0]?.quote ?? '"';
  const bracketOpenIdx = chosen.index + full.indexOf("[");
  const bodyStart = bracketOpenIdx + 1;
  const bodyEnd = bodyStart + body.length;

  return {
    bodyStart,
    bodyEnd,
    body,
    varName,
    quote,
    existingPaths: entries.map((e) => e.value),
  };
}
