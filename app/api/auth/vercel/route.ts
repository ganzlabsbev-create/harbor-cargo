import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Step 1 of connecting Vercel.
 *
 * IMPORTANT: an integration created via the Integrations Console (the
 * "oac_..." client, set up under vercel.com/dashboard/integrations/console)
 * is NOT the same system as "Sign in with Vercel" (Team Settings > Apps,
 * "cl_..." clients, https://vercel.com/oauth/authorize). Those two are
 * separate products with separate entry points. This one — the Console
 * integration, which is what lets us actually create/configure projects
 * via the API — uses its own "External installation flow" instead:
 *   https://vercel.com/integrations/:slug/new
 * See https://vercel.com/docs/integrations/create-integration/submit-integration#external-installation-flow
 *
 * That start URL doesn't take client_id/redirect_uri — both are already
 * pinned to this integration in its own settings (the Redirect URL field).
 * We only need to pass `state` for CSRF protection. Vercel redirects the
 * user back to our configured Redirect URL with `code` (and `teamId` if a
 * team was selected), which the callback route then exchanges for a token
 * exactly the way it already did.
 */
export async function GET(req: NextRequest) {
  const slug = process.env.VERCEL_INTEGRATION_SLUG;
  if (!slug) {
    return NextResponse.json({ ok: false, error: "VERCEL_INTEGRATION_SLUG is not configured" }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");

  const installUrl = new URL(`https://vercel.com/integrations/${slug}/new`);
  installUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(installUrl);
  res.cookies.set("harbor_vercel_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
