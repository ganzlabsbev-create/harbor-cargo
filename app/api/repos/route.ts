import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listRepos } from "@/lib/github";

/**
 * Returns the repo list only — no logo lookups here. Looking up a logo
 * costs 1-5 GitHub API calls per repo, which is too slow/expensive to do
 * for every repo on a single request (that's what used to cap this at the
 * first 24 repos, silently leaving the rest without an image). The client
 * now fetches logos afterwards, in small batches, via POST /api/repos/logos
 * — see that route — so every repo eventually gets a real attempt instead
 * of only the first page.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  try {
    const repos = await listRepos(session.token);
    return NextResponse.json({ ok: true, repos: repos.map((r) => ({ ...r, logoUrl: null })) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "list_repos_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
