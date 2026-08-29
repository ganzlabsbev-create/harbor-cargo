/**
 * Keeps an in-progress edit around across accidental navigations/reloads
 * (build spec enhancement: "draft กันหาย"). Scoped per repo+branch+path so
 * switching branches or repos never surfaces a stale draft for a
 * different context.
 *
 * Plain localStorage is fine here — this is a real page in the Harbor
 * Cargo web app, not a Claude Artifact (the "no browser storage" rule is
 * an Artifacts-sandbox limitation, not a rule about this codebase).
 */

const PREFIX = "harbor-code-draft:";
const MAX_DRAFT_BYTES = 3 * 1024 * 1024; // keep localStorage from filling up on one huge file

function key(owner: string, repo: string, branch: string, path: string): string {
  return `${PREFIX}${owner}/${repo}@${branch}:${path}`;
}

export function saveDraft(owner: string, repo: string, branch: string, path: string, content: string, baseSha: string): void {
  if (typeof window === "undefined") return;
  if (content.length > MAX_DRAFT_BYTES) return;
  try {
    window.localStorage.setItem(key(owner, repo, branch, path), JSON.stringify({ content, baseSha, savedAt: Date.now() }));
  } catch {
    // localStorage full/unavailable (private browsing) — draft just won't persist, not fatal
  }
}

export interface StoredDraft {
  content: string;
  baseSha: string;
  savedAt: number;
}

export function loadDraft(owner: string, repo: string, branch: string, path: string): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(owner, repo, branch, path));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDraft(owner: string, repo: string, branch: string, path: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(owner, repo, branch, path));
  } catch {
    // ignore
  }
}

/** Clears every draft for a repo — used after a successful multi-file commit. */
export function clearAllDrafts(owner: string, repo: string, branch: string, paths: string[]): void {
  for (const p of paths) clearDraft(owner, repo, branch, p);
}
