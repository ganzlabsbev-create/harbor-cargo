import { NextResponse } from "next/server";

/** Returns the server's current build id so clients can detect stale bundles. */
export async function GET() {
  return NextResponse.json({ ok: true, buildId: process.env.NEXT_PUBLIC_BUILD_ID || null });
}
