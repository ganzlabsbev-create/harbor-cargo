import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/** Lets the client know whether the current session already has a Vercel connection, without exposing the token itself. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  return NextResponse.json({
    ok: true,
    connected: Boolean(session.vercelToken),
    username: session.vercelUsername || null,
  });
}
