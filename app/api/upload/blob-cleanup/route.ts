import { NextResponse } from "next/server";
import { del } from "@vercel/blob";

/**
 * Deletes an unused blob — called when the user abandons the upload flow
 * (navigates away, closes the tab, or picks a different repo/preview) after
 * uploading but before pushing/committing. See lib/use-blob-cleanup.ts.
 *
 * The client calls this via navigator.sendBeacon so it still fires on tab
 * close, which means it must accept a plain POST with a JSON body — beacon
 * can't set custom headers or use a DELETE method.
 *
 * Public: guests can abandon a Preview/PWA upload just like a signed-in
 * user can abandon a GitHub push, and their blob needs cleaning up too.
 * This never required session ownership of the specific blob even when it
 * was session-gated (any signed-in session could clean up any pathname) —
 * so opening it to guests doesn't change what a caller can reach, it only
 * removes a login requirement that had nothing to do with this route's
 * actual authorization (deleting one already-known, opaque, short-lived
 * blob pathname).
 */
export async function POST(request: Request) {
  let pathname: unknown;
  try {
    const body = await request.json();
    pathname = body?.pathname;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!pathname || typeof pathname !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Deleting an already-deleted (or never-existed) blob is a no-op, not an
  // error, so it's safe to call this even if the blob was already cleaned
  // up server-side after a push/commit.
  await del(pathname).catch(() => {});
  return NextResponse.json({ ok: true });
}
