import { NextRequest, NextResponse } from "next/server";

/**
 * Fetches `<origin>/.well-known/assetlinks.json` on the person's own
 * domain, server-side. Done here rather than as a plain browser fetch()
 * because the target is a different origin than Harbor Cargo itself and
 * most static hosts don't send permissive CORS headers on that file —
 * a client-side fetch would just fail with an opaque CORS error even
 * when the file is perfectly fine.
 *
 * No auth required — the file this reads is, by design, meant to be
 * publicly fetchable by any Android device on the internet.
 */
export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) return NextResponse.json({ ok: false, error: "missing_url" }, { status: 400 });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(target);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
  }
  if (parsedUrl.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "https_required" }, { status: 400 });
  }
  // Only ever fetch the well-known path itself — never an arbitrary
  // caller-supplied path — even though the URL is already origin-derived
  // on the client side.
  parsedUrl.pathname = "/.well-known/assetlinks.json";
  parsedUrl.search = "";
  parsedUrl.hash = "";

  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "fetch_failed", status: res.status });
    }

    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "not_json" });
    }

    return NextResponse.json({ ok: true, body });
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return NextResponse.json({ ok: false, error: timedOut ? "timeout" : "unreachable", detail: String(err?.message || err) });
  }
}
