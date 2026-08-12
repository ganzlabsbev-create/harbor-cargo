import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

/**
 * Gatekeeper for every page except /login and the auth API routes.
 * Only checks that a session cookie is present (fast, Edge-safe) — the
 * actual decrypt + GitHub API calls happen in the API routes themselves.
 */

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/version"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/icons") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
