import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Step 1 of the OAuth relay flow: redirect the browser to GitHub's
 * authorize screen. A random `state` is stashed in a short-lived cookie and
 * checked in the callback to guard against CSRF.
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
  return res;
}
