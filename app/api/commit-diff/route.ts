import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/session";
import { extractZip } from "@/lib/zip";
import { commitFileChanges, FileChange } from "@/lib/github";
import { recordProjectPush } from "@/lib/db";

interface IncomingChange {
  path: string;
  action: "add" | "replace" | "delete";
}

/**
 * Applies the user's selected add/replace/delete set as a single commit.
 * Receives the ZIP a second time (re-sent from client state, same pattern as
 * /api/push) plus the change list decided on the diff screen. Unselected
 * files are left untouched in the repo, since commitFileChanges builds on
 * top of the branch's current tree (base_tree).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const owner = String(formData.get("owner") || "").trim();
  const repo = String(formData.get("repo") || "").trim();
  const branch = String(formData.get("branch") || "").trim();
  const commitMessage = String(formData.get("commitMessage") || "").trim() || "Update via HARBOR CARGO";

  let changes: IncomingChange[];
  try {
    changes = JSON.parse(String(formData.get("changes") || "[]"));
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_changes" }, { status: 400 });
  }

  if (!owner || !repo || !branch) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }

  const isSafePath = (p: unknown): p is string =>
    typeof p === "string" && p.length > 0 && !p.startsWith("/") && !p.split("/").includes("..");
  if (
    !Array.isArray(changes) ||
    changes.length === 0 ||
    !changes.every((c) => isSafePath(c.path) && ["add", "replace", "delete"].includes(c.action))
  ) {
    return NextResponse.json({ ok: false, error: "no_changes" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-commitdiff-${nanoid()}`);
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = extractZip(buffer, extractDir);

    const fileChanges: FileChange[] = changes.map((c) => {
      if (c.action === "delete") return { path: c.path, action: "delete" };
      const abs = path.join(extracted.extractDir, c.path);
      if (!abs.startsWith(extracted.extractDir) || !fs.existsSync(abs)) {
        throw new Error(`File "${c.path}" was not found in the uploaded ZIP — try uploading it again.`);
      }
      return { path: c.path, action: c.action, content: fs.readFileSync(abs) };
    });

    const commitUrl = await commitFileChanges(session.token, owner, repo, branch, fileChanges, commitMessage);

    await recordProjectPush({
      id: nanoid(),
      user_id: session.userId,
      project_name: repo,
      repo_url: commitUrl,
      framework: null,
    }).catch(() => {});

    return NextResponse.json({ ok: true, commitUrl });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "commit_failed", detail: String(err?.message || err) }, { status: 500 });
  } finally {
    fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }
}
