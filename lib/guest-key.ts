import type { NextRequest } from "next/server";

/**
 * Best-effort caller identifier for guest rate limiting only — never stored
 * or logged anywhere except as the opaque key in guest_rate_limits (see
 * lib/db.ts), and never exposed back to any client. Not a substitute for
 * real auth; it just stops one guest from hammering the analyze endpoints.
 */
export function guestRateKey(req: NextRequest): string {
  const ip =
    req.ip || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `guest:${ip}`;
}
