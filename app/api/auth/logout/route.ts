import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

/** Logout = delete the cookie. No token was ever persisted elsewhere to revoke. */
export async function POST() {
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
