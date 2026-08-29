import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { commitFileChanges, getRepoTree, FileChange, GitHubApiError } from "@/lib/github";

/**
 * GitHub Code's one commit endpoint — handles a single-file "Save" just as
 * well as a multi-file batch commit, a rename, a delete, or a brand-new
 * file, all through the same commitFileChanges() the Update-repo flow
 * already uses (one Git Trees commit, untouched files left alone via
 * base_tree — no new commit machinery).
 *
 * Body:
 *   { branch, message, changes: ChangeInput[] }
 *
 * ChangeInput:
 *   { kind: "edit"|"add", path, content, baseSha? }   — baseSha omitted for a brand-new file
 *   { kind: "delete", path, baseSha }
 *   { kind: "rename", fromPath, toPath, baseSha, content? } — content omitted if bytes didn't change (pure rename)
 *
 * Before touching anything, every change with a baseSha is checked against
 * the repo's current tree — if someone else changed that file on GitHub
 * since the editor loaded it, the whole commit is rejected with a plain-
 * language conflict list instead of silently overwriting their edit.
 */

interface ChangeInput {
  kind: "edit" | "add" | "delete" | "rename";
  path?: string;
  fromPath?: string;
  toPath?: string;
  content?: string;
  baseSha?: string;
}

export async function POST(req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const branch = String(body?.branch || "").trim();
  const message = String(body?.message || "").trim();
  const rawChanges: ChangeInput[] = Array.isArray(body?.changes) ? body.changes : [];

  if (!branch || !message || rawChanges.length === 0) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { owner, repo } = params;
  const token = session.token;

  try {
    // --- conflict check -----------------------------------------------
    const needsCheck = rawChanges.some((c) => c.baseSha);
    if (needsCheck) {
      const tree = await getRepoTree(token, owner, repo, branch);
      const shaByPath = new Map(tree.map((f) => [f.path, f.sha]));
      const conflicts: string[] = [];
      for (const c of rawChanges) {
        if (!c.baseSha) continue;
        const checkPath = c.kind === "rename" ? c.fromPath! : c.path!;
        const currentSha = shaByPath.get(checkPath);
        if (currentSha !== c.baseSha) conflicts.push(checkPath);
      }
      if (conflicts.length > 0) {
        return NextResponse.json({ ok: false, error: "stale_content", conflicts }, { status: 409 });
      }
    }

    // --- build the change set -------------------------------------------
    const changes: FileChange[] = [];
    for (const c of rawChanges) {
      if (c.kind === "edit" || c.kind === "add") {
        if (!c.path || c.content === undefined) {
          return NextResponse.json({ ok: false, error: "invalid_change" }, { status: 400 });
        }
        changes.push({ path: c.path, action: c.kind === "add" ? "add" : "replace", content: Buffer.from(c.content, "utf8") });
      } else if (c.kind === "delete") {
        if (!c.path) return NextResponse.json({ ok: false, error: "invalid_change" }, { status: 400 });
        changes.push({ path: c.path, action: "delete" });
      } else if (c.kind === "rename") {
        if (!c.fromPath || !c.toPath) return NextResponse.json({ ok: false, error: "invalid_change" }, { status: 400 });
        changes.push({ path: c.fromPath, action: "delete" });
        if (c.content !== undefined) {
          changes.push({ path: c.toPath, action: "add", content: Buffer.from(c.content, "utf8") });
        } else {
          // Pure rename, bytes unchanged — reuse the existing blob sha
          // instead of re-uploading identical content.
          changes.push({ path: c.toPath, action: "add", sha: c.baseSha });
        }
      }
    }

    const commitUrl = await commitFileChanges(token, owner, repo, branch, changes, message);
    return NextResponse.json({ ok: true, commitUrl });
  } catch (err: any) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "commit_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
