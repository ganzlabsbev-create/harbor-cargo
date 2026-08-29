/**
 * Minimal line-based diff for GitHub Code's "review before commit" screen.
 * A plain LCS backtrack — plenty for reviewing a handful of edited files
 * before pushing, and avoids pulling in a diff dependency for something
 * this contained (spec precedent: check before adding a new dependency).
 */

export type DiffLineType = "same" | "add" | "remove";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

const MAX_DIFF_LINES = 4000;

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");

  // Guard against pathological O(n*m) blowups on huge generated files —
  // fall back to a blunt "everything changed" view rather than hang.
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    const out: DiffLine[] = [];
    a.forEach((text, i) => out.push({ type: "remove", text, oldLineNo: i + 1, newLineNo: null }));
    b.forEach((text, i) => out.push({ type: "add", text, oldLineNo: null, newLineNo: i + 1 }));
    return out;
  }

  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: Int32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i], oldLineNo: i + 1, newLineNo: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "remove", text: a[i], oldLineNo: i + 1, newLineNo: null });
      i++;
    } else {
      out.push({ type: "add", text: b[j], oldLineNo: null, newLineNo: j + 1 });
      j++;
    }
  }
  while (i < n) {
    out.push({ type: "remove", text: a[i], oldLineNo: i + 1, newLineNo: null });
    i++;
  }
  while (j < m) {
    out.push({ type: "add", text: b[j], oldLineNo: null, newLineNo: j + 1 });
    j++;
  }
  return out;
}

/** Collapses long unchanged runs down to a few lines of context, GitHub-diff style. */
export function collapseContext(lines: DiffLine[], context = 3): (DiffLine | { type: "gap"; count: number })[] {
  const out: (DiffLine | { type: "gap"; count: number })[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "same") {
      out.push(lines[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].type === "same") j++;
    const runLength = j - i;
    if (runLength <= context * 2) {
      for (let k = i; k < j; k++) out.push(lines[k]);
    } else {
      for (let k = i; k < i + context; k++) out.push(lines[k]);
      out.push({ type: "gap", count: runLength - context * 2 });
      for (let k = j - context; k < j; k++) out.push(lines[k]);
    }
    i = j;
  }
  return out;
}
