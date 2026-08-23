import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/session";
import { getAuthenticatedUser } from "@/lib/github";
import { upsertUser } from "@/lib/db";
import { safeReturnPath } from "@/lib/return-path";

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

  // On any failure below, send the user back to /login (carrying `next`
  // along if we have one) rather than leaving them stuck — a cancelled or
  // failed login should return to where they started, not lose state.
  const failNext = safeReturnPath(req.cookies.get("harbor_oauth_next")?.value);
  function loginFailRedirect(error: string) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("error", error);
    if (failNext) url.searchParams.set("next", failNext);
    const r = NextResponse.redirect(url);
    r.cookies.delete("harbor_oauth_state");
    r.cookies.delete("harbor_oauth_next");
    return r;
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return loginFailRedirect("oauth_state");
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return loginFailRedirect("oauth_config");
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
    return loginFailRedirect("oauth_exchange");
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

  const nextPath = safeReturnPath(req.cookies.get("harbor_oauth_next")?.value) || "/";
  const res = NextResponse.redirect(new URL(nextPath, req.nextUrl.origin));
  res.cookies.delete("harbor_oauth_state");
  res.cookies.delete("harbor_oauth_next");
  return res;
}
