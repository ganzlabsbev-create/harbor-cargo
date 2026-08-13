import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { consumeUploadRateLimit, RateLimitedError, type UploadKind } from "@/lib/rate-limit";

/**
 * Called right before an upload starts (before requesting a Blob token).
 * Consumes the user's cooldown immediately if allowed — see
 * lib/rate-limit.ts for the cost model. Generic: any future upload-based
 * tool calls this the same way, not just the GitHub uploader.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

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
    await consumeUploadRateLimit(session.userId, kind, fileCount);
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
