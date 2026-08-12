import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  return NextResponse.json({ ok: true, user: { login: session.login, avatarUrl: session.avatarUrl } });
}
