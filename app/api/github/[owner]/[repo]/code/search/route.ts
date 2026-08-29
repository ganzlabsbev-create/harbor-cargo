import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { searchCode, GitHubApiError } from "@/lib/github";

/**
 * "Quick" code search (build spec: search code content, not just
 * filenames) — GitHub's own /search/code index. Only covers the repo's
 * default branch and can lag a few moments behind a fresh push; see
 * code/corpus/route.ts for the exhaustive/any-branch fallback the client
 * offers alongside this.
 */
export async function GET(req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q");
  if (!q || !q.trim()) return NextResponse.json({ ok: true, results: [] });

  try {
    const results = await searchCode(session.token, params.owner, params.repo, q.trim());
    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "search_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
