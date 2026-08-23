import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { safeReturnPath } from "@/lib/return-path";

/**
 * Step 1 of the OAuth relay flow: redirect the browser to GitHub's
 * authorize screen. A random `state` is stashed in a short-lived cookie and
 * checked in the callback to guard against CSRF.
 *
 * Also accepts an optional `?next=` — the page to return to once login
 * succeeds (e.g. "/tools/github/new"), stashed in its own short-lived
 * cookie and consumed by the callback. Guests hitting a protected tool's
 * "sign in" button (see components/AuthGate.tsx) always pass this, so
 * they land back on the tool instead of the home page.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "GITHUB_OAUTH_CLIENT_ID is not configured" },
      { status: 500 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/auth/github/callback", req.nextUrl.origin).toString();
  const next = safeReturnPath(req.nextUrl.searchParams.get("next"));

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "repo read:user");
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("harbor_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  if (next) {
    res.cookies.set("harbor_oauth_next", next, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  } else {
    res.cookies.delete("harbor_oauth_next");
  }
  return res;
}
