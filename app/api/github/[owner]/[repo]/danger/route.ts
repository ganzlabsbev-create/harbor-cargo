import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { setRepoArchived, renameRepo, deleteRepo, sanitizeRepoName, GitHubApiError } from "@/lib/github";

/**
 * Danger Zone (build spec section 8) — archive, rename, delete.
 *
 * Every action here is confirmed client-side first (see
 * app/tools/github/settings/[owner]/[repo]/danger/page.tsx), but that's UX
 * only — the spec is explicit that client checks are never a security
 * boundary, so `action` + the exact-name match for delete are re-validated
 * here regardless of what the client already confirmed.
 */
export async function POST(req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const { owner, repo } = params;

  try {
    if (action === "archive") {
      await setRepoArchived(session.token, owner, repo, true);
      return NextResponse.json({ ok: true });
    }

    if (action === "unarchive") {
      await setRepoArchived(session.token, owner, repo, false);
      return NextResponse.json({ ok: true });
    }

    if (action === "rename") {
      const newName = sanitizeRepoName(String(body?.newName || ""));
      if (!newName) return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
      const settings = await renameRepo(session.token, owner, repo, newName);
      return NextResponse.json({ ok: true, settings });
    }

    if (action === "delete") {
      // Re-check the confirmation server-side — the UI only lets you press
      // the button once this already matches, but that's a UX guardrail,
      // not the actual boundary (spec section 19).
      const confirmName = String(body?.confirmName || "");
      if (confirmName !== repo) {
        return NextResponse.json({ ok: false, error: "confirmation_mismatch" }, { status: 400 });
      }
      await deleteRepo(session.token, owner, repo);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (err: any) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "danger_action_failed", detail: String((err as any)?.message || err) }, { status: 500 });
  }
}
