import { getNextUploadAt, setNextUploadAt } from "@/lib/db";

/**
 * Per-user cooldown before the next upload is allowed. Deliberately generic —
 * not tied to GitHub or any specific destination — so any future
 * upload-based tool (Vercel, Netlify, ...) can reuse the same cost model and
 * the same /api/upload/rate-limit route.
 *
 * Cost model: a raw .zip upload costs a flat 60s cooldown. A bundle of loose
 * files costs 5s per file (e.g. 10 loose files = 50s). The cooldown starts
 * the moment the upload is authorized, not when it finishes, so a retried or
 * abandoned upload still counts — it can't be used to dodge the limit.
 */

const ZIP_COOLDOWN_SECONDS = 60;
const LOOSE_FILE_COOLDOWN_SECONDS = 5;

export type UploadKind = "zip" | "loose";

export function computeCooldownSeconds(kind: UploadKind, fileCount: number): number {
  if (kind === "zip") return ZIP_COOLDOWN_SECONDS;
  const count = Math.max(1, Math.floor(fileCount) || 1);
  return count * LOOSE_FILE_COOLDOWN_SECONDS;
}

export class RateLimitedError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("rate_limited");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Throws RateLimitedError if the user must still wait. Otherwise starts the
 * next cooldown immediately (before the upload itself even begins).
 */
export async function consumeUploadRateLimit(userId: number, kind: UploadKind, fileCount: number): Promise<void> {
  const now = new Date();
  const nextAllowed = await getNextUploadAt(userId);
  if (nextAllowed && nextAllowed.getTime() > now.getTime()) {
    const retryAfterSeconds = Math.ceil((nextAllowed.getTime() - now.getTime()) / 1000);
    throw new RateLimitedError(retryAfterSeconds);
  }
  const cooldown = computeCooldownSeconds(kind, fileCount);
  const next = new Date(now.getTime() + cooldown * 1000);
  await setNextUploadAt(userId, next);
}
