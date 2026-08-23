import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { consumeUploadRateLimit, consumeGuestUploadRateLimit, RateLimitedError, type UploadKind } from "@/lib/rate-limit";
import { guestRateKey } from "@/lib/guest-key";

/**
 * Called right before an upload starts (before requesting a Blob token).
 * Consumes the caller's cooldown immediately if allowed — see
 * lib/rate-limit.ts for the cost model. Generic: any future upload-based
 * tool calls this the same way, not just the GitHub uploader.
 *
 * This endpoint is intentionally public — Harbor Preview and the PWA
 * Generator upload without a GitHub session (see app/tools/preview,
 * app/tools/harbor/pwa), so a signed-in user is rate-limited by their
 * account and a guest is rate-limited by a coarse per-IP key instead of
 * being turned away outright.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();

  let kind: UploadKind = "zip";
  let fileCount = 1;
  try {
    const body = await request.json();
    if (body?.kind === "loose") kind = "loose";
    if (typeof body?.fileCount === "number") fileCount = body.fileCount;
  } catch {
    // defaults above
  }

  try {
    if (session) {
      await consumeUploadRateLimit(session.userId, kind, fileCount);
    } else {
      await consumeGuestUploadRateLimit(guestRateKey(request), kind, fileCount);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", retryAfterSeconds: err.retryAfterSeconds },
        { status: 429 }
      );
    }
    return NextResponse.json({ ok: false, error: "rate_limit_check_failed" }, { status: 500 });
  }
}
