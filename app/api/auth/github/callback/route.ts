import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/session";
import { getAuthenticatedUser } from "@/lib/github";
import { upsertUser } from "@/lib/db";

/**
 * Step 2 of the OAuth relay flow. GitHub redirects here with `code`.
 * The token exchange MUST happen server-side — github.com/login/oauth/access_token
 * doesn't allow CORS from the browser, so this hop is unavoidable, not a choice.
 *
 * The instant we have the access_token we encrypt it straight into the
 * response's Set-Cookie header. It is never logged, written to a file, or
 * inserted into the database — see lib/session.ts.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = req.cookies.get("harbor_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", req.nextUrl.origin));
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=oauth_config", req.nextUrl.origin));
  }

  const redirectUri = new URL("/api/auth/github/callback", req.nextUrl.origin).toString();

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/login?error=oauth_exchange", req.nextUrl.origin));
  }

  const token: string = tokenData.access_token;
  const user = await getAuthenticatedUser(token);

  await createSessionCookie({
    token,
    login: user.login,
    avatarUrl: user.avatar_url,
    userId: user.id,
  });

  await upsertUser({ githubId: user.id, username: user.login, avatarUrl: user.avatar_url }).catch(() => {
    // Non-fatal: Postgres may not be provisioned yet. The session still works.
  });

  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.delete("harbor_oauth_state");
  return res;
}
