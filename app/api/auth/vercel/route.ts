import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Step 1 of connecting Vercel: redirect to Vercel's OAuth authorize screen.
 * Mirrors app/api/auth/github/route.ts exactly — same CSRF-state-cookie
 * pattern, separate cookie name so it can't collide with the GitHub flow
 * if a user somehow triggers both at once.
 *
 * Requires a Vercel OAuth "Integration" client to be registered at
 * https://vercel.com/dashboard/integrations/console (Integration type:
 * "OAuth2 Application"), with this route's callback URL added as a
 * redirect URI.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.VERCEL_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "VERCEL_OAUTH_CLIENT_ID is not configured" }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/auth/vercel/callback", req.nextUrl.origin).toString();

  const authorizeUrl = new URL("https://vercel.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("harbor_vercel_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
