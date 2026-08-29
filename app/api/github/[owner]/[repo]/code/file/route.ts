import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getFileContent, GitHubApiError } from "@/lib/github";

/**
 * GitHub Code — fetch one file's content + sha to open in the editor.
 * The returned `sha` is what the client sends back on save/commit so the
 * server can detect if the file changed on GitHub in the meantime (see
 * code/commit/route.ts) — same idea as the Contents API's own optimistic
 * concurrency, just checked explicitly so the error message can be plain
 * language instead of a raw 409.
 */
export async function GET(req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const path = req.nextUrl.searchParams.get("path");
  const branch = req.nextUrl.searchParams.get("branch");
  if (!path || !branch) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  try {
    const file = await getFileContent(session.token, params.owner, params.repo, path, branch);
    return NextResponse.json({ ok: true, file });
  } catch (err: any) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "read_file_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
