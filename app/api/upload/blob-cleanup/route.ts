import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getSession } from "@/lib/session";

/**
 * Deletes an unused blob — called when the user abandons the upload flow
 * (navigates away, closes the tab, or picks a different repo) after
 * uploading but before pushing/committing. See lib/use-blob-cleanup.ts.
 *
 * The client calls this via navigator.sendBeacon so it still fires on tab
 * close, which means it must accept a plain POST with a JSON body — beacon
 * can't set custom headers or use a DELETE method.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

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
