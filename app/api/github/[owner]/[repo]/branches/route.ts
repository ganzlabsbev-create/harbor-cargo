import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listBranches, GitHubApiError } from "@/lib/github";

/**
 * Lists branches for a repo — used by the default-branch picker in
 * Repository Settings and by the branch selector in the Download Project
 * modal. Intentionally lightweight (name + protected flag only); full
 * branch-protection detail is fetched per-branch on demand, not here.
 */
export async function GET(_req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  try {
    const branches = await listBranches(session.token, params.owner, params.repo);
    return NextResponse.json({ ok: true, branches });
  } catch (err: any) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "list_branches_failed", detail: String((err as any)?.message || err) }, { status: 500 });
  }
}
