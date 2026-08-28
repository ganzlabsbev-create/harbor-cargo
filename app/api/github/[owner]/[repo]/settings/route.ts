import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getRepoSettings, updateRepoSettings, updateRepoTopics, GitHubApiError, RepoSettingsPatch } from "@/lib/github";

/**
 * GitHub Settings > Repository (build spec section 3).
 *
 * GET returns the current settings; PATCH applies only the fields the
 * client actually changed (dirty-state save, not per-keystroke) — see
 * app/tools/github/settings/[owner]/[repo]/repository/page.tsx.
 *
 * Same auth/session pattern as the rest of the GitHub Uploader routes:
 * session cookie only, GitHub's own token never touches the client, and
 * every GitHub-side failure is normalized through GitHubApiError before it
 * reaches the response body — no raw GitHub error text or stack traces.
 */

function errorResponse(err: unknown) {
  if (err instanceof GitHubApiError) {
    return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
  }
  return NextResponse.json({ ok: false, error: "github_settings_failed", detail: String((err as any)?.message || err) }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  try {
    const settings = await getRepoSettings(session.token, params.owner, params.repo);
    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // Topics use a dedicated GitHub endpoint, so they're split out from the
  // regular PATCH /repos body rather than sent together.
  const { topics, ...rest } = body as { topics?: string[] } & RepoSettingsPatch;

  try {
    let settings = await updateRepoSettings(session.token, params.owner, params.repo, rest);
    if (Array.isArray(topics)) {
      const savedTopics = await updateRepoTopics(session.token, params.owner, params.repo, topics);
      settings = { ...settings, topics: savedTopics };
    }
    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    return errorResponse(err);
  }
}
