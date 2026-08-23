import { getNextUploadAt, setNextUploadAt, getGuestNextUploadAt, setGuestNextUploadAt } from "@/lib/db";

/**
 * Per-user (or per-guest) cooldown before the next upload is allowed.
 * Deliberately generic — not tied to GitHub or any specific destination —
 * so any future upload-based tool (Vercel, Netlify, ...) can reuse the same
 * cost model and the same /api/upload/rate-limit route.
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

/**
 * Same cost model and same cooldown semantics as consumeUploadRateLimit,
 * but for signed-out guests using Harbor Preview / PWA Generator — those
 * tools intentionally don't require a GitHub session (see
 * app/tools/preview, app/tools/harbor/pwa), so there's no userId to key
 * off of. `rateKey` should be a coarse, non-identifying string derived from
 * the request (see app/api/upload/rate-limit/route.ts) — never anything
 * that identifies a person.
 */
export async function consumeGuestUploadRateLimit(rateKey: string, kind: UploadKind, fileCount: number): Promise<void> {
  const now = new Date();
  const nextAllowed = await getGuestNextUploadAt(rateKey);
  if (nextAllowed && nextAllowed.getTime() > now.getTime()) {
    const retryAfterSeconds = Math.ceil((nextAllowed.getTime() - now.getTime()) / 1000);
    throw new RateLimitedError(retryAfterSeconds);
  }
  const cooldown = computeCooldownSeconds(kind, fileCount);
  const next = new Date(now.getTime() + cooldown * 1000);
  await setGuestNextUploadAt(rateKey, next);
}
