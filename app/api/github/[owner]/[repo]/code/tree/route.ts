import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getRepoTree, GitHubApiError } from "@/lib/github";

/**
 * Lists every file path (+ blob sha) in a branch — the file tree, fuzzy
 * path search, and deep-search corpus fetch all start from this same
 * list, so it's fetched once here rather than each component re-deriving
 * it from the raw GitHub tree response.
 */
export async function GET(req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const branch = req.nextUrl.searchParams.get("branch");
  if (!branch) return NextResponse.json({ ok: false, error: "missing_branch" }, { status: 400 });

  try {
    const tree = await getRepoTree(session.token, params.owner, params.repo, branch);
    return NextResponse.json({ ok: true, files: tree });
  } catch (err: any) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "tree_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
