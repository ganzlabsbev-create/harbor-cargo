import { NextRequest, NextResponse } from "next/server";
import { updateSessionCookie } from "@/lib/session";
import { getAuthenticatedVercelUser } from "@/lib/vercel";

/**
 * Step 2: Vercel redirects here with `code`. Same server-side-only token
 * exchange constraint as GitHub (see app/api/auth/github/callback) — the
 * token is folded into the existing encrypted session cookie via
 * updateSessionCookie and is never persisted anywhere else.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  // Present only when the user installed on behalf of a Vercel team rather
  // than their personal account — this comes back as a query param on
  // THIS redirect (the "External installation flow"), not inside the
  // token-exchange response body.
  const teamId = searchParams.get("teamId");
  const expectedState = req.cookies.get("harbor_vercel_oauth_state")?.value;

  const failRedirect = new URL("/tools/vercel/new?error=vercel_oauth", req.nextUrl.origin);

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(failRedirect);
  }

  const clientId = process.env.VERCEL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.VERCEL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(failRedirect);
  }

  const redirectUri = new URL("/api/auth/vercel/callback", req.nextUrl.origin).toString();

  const tokenRes = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(failRedirect);
  }

  const token: string = tokenData.access_token;

  let vercelUsername = "";
  try {
    const user = await getAuthenticatedVercelUser(token);
    vercelUsername = user.username || user.name || "";
  } catch {
    // Non-fatal — the project-create step will surface any real auth
    // problem, and the username is display-only.
  }

  const updated = await updateSessionCookie({ vercelToken: token, vercelUsername, vercelTeamId: teamId });
  if (!updated) {
    // No existing HARBOR session — shouldn't happen since this route sits
    // behind the GitHub-session gate in middleware, but guard anyway.
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const res = NextResponse.redirect(new URL("/tools/vercel/new?connected=1", req.nextUrl.origin));
  res.cookies.delete("harbor_vercel_oauth_state");
  return res;
}
