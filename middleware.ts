import { NextRequest, NextResponse } from "next/server";

/**
 * Guest-first routing.
 *
 * Harbor Cargo used to gate every route behind a session cookie here and
 * redirect anything unauthenticated straight to "/login". That's gone.
 *
 * The app is now organized like this instead:
 *
 * PUBLIC / GUEST (no session needed, never redirected):
 *   - "/"                      (home)
 *   - "/tools/harbor"          (Harbor tools hub)
 *   - "/tools/harbor/pwa"      (PWA Generator — fully client-side)
 *   - "/tools/preview"         (Web Project Preview)
 *   - "/tools/github"          (chooser — just links, no GitHub calls)
 *   - "/tools/vercel"          (chooser — just links, no Vercel calls)
 *   - "/settings" and "/settings/*" (Settings + About/Help/Version/License/Privacy)
 *   - "/login"                 (still here for when a user wants to sign in)
 *   - public API routes ("/api/version", "/api/me", the analyze-only
 *     "/api/upload*" endpoints) and static/PWA assets (manifest, service
 *     worker, icons)
 *
 * PROTECTED (requires a GitHub session / Vercel connection):
 *   - GitHub operations: "/tools/github/new", "/tools/github/update"
 *   - Vercel operations: "/tools/vercel/new", "/tools/vercel/manage*"
 *   - the underlying API routes those pages call (/api/push, /api/diff,
 *     /api/commit-diff, /api/repos, /api/vercel/*)
 *
 * IMPORTANT: none of the PROTECTED items above are enforced here anymore.
 * Redirecting from middleware would either bounce guests out of pages that
 * are supposed to render for them (the page itself decides what a guest can
 * see — e.g. "/tools/github" is a plain chooser) or silently 302 an API
 * fetch() call into an HTML page, which breaks the client's JSON parsing
 * and hides the real reason from the user. So instead:
 *
 *   - Every protected PAGE checks its own session client-side (via
 *     components/AuthGate.tsx, which calls /api/me) and renders an in-page
 *     "please sign in" prompt instead of the tool UI.
 *   - Every protected API ROUTE already checks getSession()/tokens itself
 *     and returns a proper 401/403 JSON response — see
 *     app/api/push/route.ts, app/api/repos/route.ts, app/api/vercel/**,
 *     etc. That's the real security boundary; this file does not weaken it.
 *
 * This middleware is intentionally close to a no-op now. It's kept around
 * (rather than deleted) so the routing intent above stays documented in one
 * place, and as a hook for any future truly-global concern (e.g. locale
 * detection) that doesn't belong in individual routes.
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Keep the matcher scoped the same way it always was (skip Next's own
    // static/image internals) — there's just nothing left inside that
    // redirects anymore.
    "/((?!_next/static|_next/image).*)",
  ],
};
