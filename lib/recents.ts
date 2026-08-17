/**
 * "Recent tools" quick-jump list shown at the bottom of the home page.
 *
 * Kept entirely in the browser's localStorage — HARBOR CARGO is intentionally
 * zero data retention (see lib/session.ts: even the GitHub/Vercel tokens
 * never touch a database), so this never calls an API route or gets synced
 * anywhere. The user can clear it via clearRecents() or by clearing site
 * data in their browser.
 */

const STORAGE_KEY = "harbor_recent_tools";
const MAX_ENTRIES = 5;

export type RecentToolType = "github-update" | "vercel-manage";

export interface RecentTool {
  /** Stable identity used for de-duping (e.g. "github-update:owner/repo:branch" or "vercel-manage:projectId"). */
  id: string;
  type: RecentToolType;
  /** Main line, e.g. the repo full_name or Vercel project name. */
  label: string;
  /** Secondary line, e.g. branch name or framework. */
  sublabel?: string;
  /** Where tapping the card should go — a deep link that skips the picker step. */
  href: string;
  /** ms epoch, used for ordering and relative-time display. */
  ts: number;
}

function readAll(): RecentTool[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: RecentTool[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full/unavailable (private browsing, etc.) — silently skip,
    // this is a convenience feature, never load-bearing
  }
}

/** Returns recents newest-first, capped at MAX_ENTRIES. */
export function getRecents(): RecentTool[] {
  return readAll()
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_ENTRIES);
}

/** Adds/updates an entry (matched by id) and moves it to the front. */
export function addRecent(entry: Omit<RecentTool, "ts">) {
  const existing = readAll().filter((e) => e.id !== entry.id);
  const next = [{ ...entry, ts: Date.now() }, ...existing]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_ENTRIES);
  writeAll(next);
}

/** Removes one entry by id — used when a recent turns out to be stale (repo/project deleted or access revoked). */
export function removeRecent(id: string) {
  writeAll(readAll().filter((e) => e.id !== id));
}

export function clearRecents() {
  writeAll([]);
}
