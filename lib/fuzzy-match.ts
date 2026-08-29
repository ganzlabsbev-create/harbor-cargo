/**
 * Fuzzy path matcher for GitHub Code's file search. Supports the
 * "folder/folder/file" segment-by-segment typing style the build spec asks
 * for, but isn't limited to exact segment prefixes — a query like
 * "cmp/hdr" still matches "components/Header.tsx" via a VSCode-style
 * subsequence match, scored so tighter/earlier matches rank higher.
 *
 * Pure, synchronous, no dependencies — cheap enough to re-run on every
 * keystroke against a repo's full path list (a few thousand entries is
 * still sub-millisecond).
 */

export interface FuzzyMatch {
  path: string;
  score: number;
  /** Indices into `path` that matched the query, for highlighting. */
  indices: number[];
}

/**
 * Scores `path` against `query`. Returns null if `query`'s characters
 * don't all appear in order somewhere in `path` (case-insensitive).
 * Slashes get their own small bonus so segment-boundary matches (typing
 * "components/Header" case) win over a coincidental mid-word hit.
 */
function scoreOne(path: string, query: string): FuzzyMatch | null {
  const p = path.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return { path, score: 0, indices: [] };

  const indices: number[] = [];
  let pi = 0;
  let score = 0;
  let prevMatchIdx = -2;
  let consecutiveRun = 0;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const foundAt = p.indexOf(ch, pi);
    if (foundAt === -1) return null;

    // Reward: match right after the previous match (consecutive run),
    // match right after a '/' or '.' (new path segment / extension),
    // and matches earlier in the string overall.
    if (foundAt === prevMatchIdx + 1) {
      consecutiveRun++;
      score += 8 + consecutiveRun * 2;
    } else {
      consecutiveRun = 0;
      score += 1;
    }
    if (foundAt === 0 || p[foundAt - 1] === "/" || p[foundAt - 1] === "." || p[foundAt - 1] === "-" || p[foundAt - 1] === "_") {
      score += 10;
    }
    score -= foundAt * 0.02;

    indices.push(foundAt);
    prevMatchIdx = foundAt;
    pi = foundAt + 1;
  }

  // Short overall match relative to path length reads as "more precise".
  score += Math.max(0, 20 - (indices[indices.length - 1] - indices[0]));
  // Filename (not full path) matches feel more relevant than a hit buried
  // only in an early folder segment.
  const lastSlash = p.lastIndexOf("/");
  if (indices[0] > lastSlash) score += 15;

  return { path, score, indices };
}

/**
 * Filters + ranks `paths` against `query`. Empty query returns everything
 * in original order (score 0) so the tree/list just shows all files.
 */
export function fuzzySearchPaths(paths: string[], query: string, limit = 200): FuzzyMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return paths.map((path) => ({ path, score: 0, indices: [] }));

  const out: FuzzyMatch[] = [];
  for (const path of paths) {
    const m = scoreOne(path, trimmed);
    if (m) out.push(m);
  }
  out.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  return out.slice(0, limit);
}
