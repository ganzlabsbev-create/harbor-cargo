import fs from "fs";
import path from "path";

/**
 * GitHub API helpers. Adapted from the original tool: every function now
 * takes the user's own OAuth token as a parameter instead of reading a
 * static process.env.GITHUB_TOKEN — see build spec section 7.
 */

const API = "https://api.github.com";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

/**
 * Thrown by gh() instead of a bare Error. `code` is a stable machine-readable
 * reason (used by the frontend to decide things like "show a re-login
 * button"), `message` is already safe to show to the user as-is — no raw
 * GitHub API text ever reaches the UI.
 */
export class GitHubApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.code = code;
  }
}

/** Maps a failed GitHub API response into a user-friendly GitHubApiError. */
function friendlyGithubError(status: number, pathname: string, rawText: string): GitHubApiError {
  let githubMessage = "";
  try {
    githubMessage = JSON.parse(rawText)?.message || "";
  } catch {
    // response wasn't JSON — ignore, fall back to generic messages below
  }

  if (status === 401) {
    return new GitHubApiError(status, "github_auth_expired", "Your GitHub session has expired. Please sign in again.");
  }
  if (status === 403 && /rate limit/i.test(githubMessage)) {
    return new GitHubApiError(status, "github_rate_limited", "GitHub's rate limit was reached. Please wait a few minutes and try again.");
  }
  if (status === 403) {
    return new GitHubApiError(status, "github_forbidden", "GitHub denied this action — HARBOR CARGO may no longer have access to this repository.");
  }
  if (status === 404) {
    return new GitHubApiError(status, "github_not_found", "That repository couldn't be found, or you no longer have access to it.");
  }
  if (status === 409) {
    return new GitHubApiError(status, "github_conflict", "The repository changed on GitHub while this was in progress. Please try again.");
  }
  if (status === 422 && /name already exists/i.test(githubMessage)) {
    return new GitHubApiError(status, "github_name_taken", "A repository with that name already exists on your account.");
  }
  if (status === 422) {
    return new GitHubApiError(status, "github_invalid", githubMessage || "GitHub rejected this request as invalid.");
  }
  if (status === 429) {
    return new GitHubApiError(status, "github_rate_limited", "Too many requests to GitHub right now. Please wait a moment and try again.");
  }
  if (status >= 500) {
    return new GitHubApiError(status, "github_server_error", "GitHub is having issues right now. Please try again shortly.");
  }
  return new GitHubApiError(status, "github_error", githubMessage || `GitHub API error (${pathname}): ${status}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Reads how long to wait before retrying from GitHub's own headers instead of
 * guessing. `Retry-After` (seconds) is what the secondary/abuse rate limiter
 * sends; `x-ratelimit-reset` (unix seconds) is what the primary rate limiter
 * sends. Falls back to `fallbackMs` if neither header is present.
 */
function retryDelayMs(res: Response, fallbackMs: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  }
  const reset = res.headers.get("x-ratelimit-reset");
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (reset && remaining === "0") {
    const resetMs = Number(reset) * 1000 - Date.now();
    if (resetMs > 0) return resetMs;
  }
  return fallbackMs;
}

const MAX_RATE_LIMIT_RETRIES = 5;

async function gh(token: string, pathname: string, init?: RequestInit) {
  let attempt = 0;
  while (true) {
    const res = await fetch(`${API}${pathname}`, { ...init, headers: headers(token) });
    if (res.ok) {
      return res.json();
    }

    const text = await res.text();
    const isRateLimited = res.status === 429 || (res.status === 403 && /rate limit/i.test(text));

    if (isRateLimited && attempt < MAX_RATE_LIMIT_RETRIES) {
      // Cap the wait so a single call never blocks a request for more than
      // ~20s — beyond that it's better to surface the friendly error and let
      // the user retry than to hold the connection open indefinitely.
      const delay = Math.min(retryDelayMs(res, 1000 * 2 ** attempt), 20000);
      attempt++;
      await sleep(delay);
      continue;
    }

    throw friendlyGithubError(res.status, pathname, text);
  }
}

export async function getAuthenticatedUser(token: string): Promise<{
  id: number;
  login: string;
  avatar_url: string;
}> {
  const me = await gh(token, "/user");
  return { id: me.id, login: me.login, avatar_url: me.avatar_url };
}

/** Creates a new repo (private by default) under the authenticated user's account. */
export async function createRepoIfNeeded(
  token: string,
  owner: string,
  repoName: string,
  isPrivate: boolean
): Promise<{ owner: string; repo: string }> {
  const checkRes = await fetch(`${API}/repos/${owner}/${repoName}`, { headers: headers(token) });
  if (checkRes.ok) {
    return { owner, repo: repoName };
  }

  await gh(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({ name: repoName, private: isPrivate, auto_init: true }),
  });

  // Repo was auto_init'd — wait for GitHub to finish creating the first commit
  // (README) before we try to read refs, otherwise we can hit a 409.
  for (let i = 0; i < 5; i++) {
    const ref = await fetch(`${API}/repos/${owner}/${repoName}/git/refs/heads/main`, {
      headers: headers(token),
    });
    if (ref.ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  return { owner, repo: repoName };
}

/** Pushes every file in extractDir in a single commit via the Git Data API. */
export async function pushFilesToRepo(
  token: string,
  owner: string,
  repo: string,
  extractDir: string,
  relativeFiles: string[],
  commitMessage = "Initial upload via HARBOR CARGO",
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  let baseSha: string | null = null;
  let defaultBranch = "main";

  try {
    const repoInfo = await gh(token, `/repos/${owner}/${repo}`);
    defaultBranch = repoInfo.default_branch || "main";
    const ref = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`);
    baseSha = ref.object.sha;
  } catch {
    baseSha = null;
  }

  const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  let completed = 0;
  for (const rel of relativeFiles) {
    const abs = path.join(extractDir, rel);
    const content = fs.readFileSync(abs);
    const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
    });
    treeItems.push({ path: rel, mode: "100644", type: "blob", sha: blob.sha });
    completed++;
    onProgress?.(completed, relativeFiles.length);
    // Small pacing gap between blob POSTs. GitHub's secondary/abuse rate
    // limiter throttles bursts of content-creating requests even when well
    // under the primary hourly quota — this keeps large uploads (100+
    // files) from tripping it in the first place.
    await sleep(120);
  }

  const tree = await gh(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree: treeItems }),
  });

  const commit = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: commitMessage,
      tree: tree.sha,
      parents: baseSha ? [baseSha] : [],
    }),
  });

  if (baseSha) {
    await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } else {
    await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${defaultBranch}`, sha: commit.sha }),
    });
  }

  return `https://github.com/${owner}/${repo}`;
}

export function sanitizeRepoName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/** Lists every repo the token's owner can access, paging through all results. */
export async function listRepos(
  token: string
): Promise<{ name: string; full_name: string; default_branch: string; updated_at: string; language: string | null }[]> {
  const perPage = 100;
  const results: any[] = [];
  let page = 1;

  while (true) {
    const pathname = `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`;
    const data = await gh(token, pathname);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < perPage) break;
    page++;
  }

  return results.map((r) => ({
    name: r.name,
    full_name: r.full_name,
    default_branch: r.default_branch || "main",
    updated_at: r.updated_at,
    language: r.language || null,
  }));
}

const LOGO_FILENAME = /^(logo|icon|favicon)\.(png|jpe?g|svg|webp)$/i;
const LOGO_DIRS = ["", "public", "assets", "static", ".github"];

/**
 * Looks for a project logo/icon image in common spots (repo root, then
 * public/assets/static/.github). One API call per directory checked, and
 * stops at the first match — so usually 1 call, worst case 5. Returns null
 * (never throws) if nothing is found or the repo is empty/inaccessible —
 * <RepoIcon> shows the plain GitHub icon in that case rather than a
 * lookalike image. (An earlier version of this fell back to GitHub's
 * auto-generated social-preview image, but that card is often unrelated
 * artwork/a generic banner, not the project's actual logo, so it's been
 * removed again.)
 */
export async function findRepoLogo(token: string, owner: string, repo: string): Promise<string | null> {
  for (const dir of LOGO_DIRS) {
    try {
      const data = await gh(token, `/repos/${owner}/${repo}/contents/${dir}`);
      if (!Array.isArray(data)) continue;
      const match = data.find((entry: any) => entry.type === "file" && LOGO_FILENAME.test(entry.name));
      if (match?.download_url) return match.download_url as string;
    } catch {
      // directory doesn't exist / repo empty / rate limited — just try the next spot
    }
  }
  return null;
}

/** Flat list of { path, sha } for every file currently in a repo/branch. */
export async function getRepoTree(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ path: string; sha: string }[]> {
  try {
    const data = await gh(
      token,
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    );
    if (!Array.isArray(data.tree)) return [];
    return data.tree.filter((item: any) => item.type === "blob").map((item: any) => ({ path: item.path, sha: item.sha }));
  } catch {
    return [];
  }
}

export interface FileChange {
  path: string;
  action: "add" | "replace" | "delete";
  content?: Buffer;
  /**
   * Reuse an already-existing blob instead of uploading `content` as a new
   * one. Used for a pure repo-side rename — moving a repo-only file the
   * user never touched in the ZIP — where the file's bytes haven't changed,
   * only its path.
   */
  sha?: string;
}

/** Commits an add/replace/delete set in one commit, preserving untouched files. */
export async function commitFileChanges(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  changes: FileChange[],
  commitMessage: string,
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  if (changes.length === 0) {
    throw new Error("No changes selected");
  }

  // Safety net: a caller could in theory hand us both a delete and an
  // add/replace for the same path — two Tree entries at one path is
  // ambiguous, GitHub just keeps whichever one it processes last, so if the
  // delete happens to land after the add/replace, the new content would
  // silently vanish. Content always wins here; each path keeps only its
  // final instruction. (The frontend already dedupes before calling this,
  // this just guards any other caller.)
  const contentPaths = new Set(changes.filter((c) => c.action === "add" || c.action === "replace").map((c) => c.path));
  changes = changes.filter((c) => c.action !== "delete" || !contentPaths.has(c.path));

  let baseCommitSha: string | null = null;
  let baseTreeSha: string | null = null;
  try {
    const ref = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    baseCommitSha = ref.object.sha;
    const commitInfo = await gh(token, `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
    baseTreeSha = commitInfo.tree.sha;
  } catch {
    baseCommitSha = null;
    baseTreeSha = null;
  }

  const treeItems: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
  let completed = 0;
  for (const change of changes) {
    if (change.action === "delete") {
      treeItems.push({ path: change.path, mode: "100644", type: "blob", sha: null });
      completed++;
      onProgress?.(completed, changes.length);
      continue;
    }
    if (change.sha) {
      // Rename-only: the content already exists as this blob, just point
      // the new path at it — no upload needed.
      treeItems.push({ path: change.path, mode: "100644", type: "blob", sha: change.sha });
      completed++;
      onProgress?.(completed, changes.length);
      continue;
    }
    if (!change.content) {
      throw new Error(`Missing file content for "${change.path}"`);
    }
    const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: change.content.toString("base64"), encoding: "base64" }),
    });
    treeItems.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
    completed++;
    onProgress?.(completed, changes.length);
    // Same pacing as pushFilesToRepo — this is the path a 100+ file diff
    // (like "replace 179 files") goes through, and it's exactly what was
    // tripping GitHub's secondary rate limiter.
    await sleep(120);
  }

  const tree = await gh(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
      tree: treeItems,
    }),
  });

  const commit = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: commitMessage,
      tree: tree.sha,
      parents: baseCommitSha ? [baseCommitSha] : [],
    }),
  });

  if (baseCommitSha) {
    await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } else {
    await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  return `https://github.com/${owner}/${repo}/commit/${commit.sha}`;
}
