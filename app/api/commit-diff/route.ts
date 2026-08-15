import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { del } from "@vercel/blob";
import { getSession } from "@/lib/session";
import { extractZip } from "@/lib/zip";
import { commitFileChanges, FileChange } from "@/lib/github";
import { recordProjectPush } from "@/lib/db";
import { fetchBlobBuffer } from "@/lib/blob-fetch";

interface IncomingChange {
  /** Destination path in the repo. */
  path: string;
  action: "add" | "replace" | "delete";
  /**
   * For add/replace: where to read the content from within the extracted
   * ZIP, if different from `path` (a file that was dragged to a new folder
   * before confirming keeps its original ZIP location but targets a new
   * repo path). Defaults to `path` when omitted.
   */
  zipPath?: string;
  /**
   * For add/replace: reuse an existing blob instead of reading from the
   * ZIP — used for a pure repo-side rename of a file that was never in the
   * ZIP to begin with (see DiffTreeView's drag support for repo-only files).
   */
  sha?: string;
}

/**
 * Applies the user's selected add/replace/delete set as a single commit.
 * Reads the same blob /api/diff already looked at (see
 * components/UploadZone.tsx) plus the change list decided on the diff
 * screen. Unselected files are left untouched in the repo, since
 * commitFileChanges builds on top of the branch's current tree (base_tree).
 * The blob is always deleted once this request is done with it, success or
 * failure, so nothing lingers in storage.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const blobUrl = body?.blobUrl;
  const blobPathname = body?.blobPathname;
  const owner = String(body?.owner || "").trim();
  const repo = String(body?.repo || "").trim();
  const branch = String(body?.branch || "").trim();
  const commitMessage = String(body?.commitMessage || "").trim() || "Update via HARBOR CARGO";
  const changes: IncomingChange[] = Array.isArray(body?.changes) ? body.changes : [];

  if (!owner || !repo || !branch) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!blobUrl || !blobPathname) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }

  const isSafePath = (p: unknown): p is string =>
    typeof p === "string" && p.length > 0 && !p.startsWith("/") && !p.split("/").includes("..");
  if (
    changes.length === 0 ||
    !changes.every(
      (c) =>
        isSafePath(c.path) &&
        ["add", "replace", "delete"].includes(c.action) &&
        (c.zipPath === undefined || isSafePath(c.zipPath))
    )
  ) {
    await del(blobPathname).catch(() => {});
    return NextResponse.json({ ok: false, error: "no_changes" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-commitdiff-${nanoid()}`);
  try {
    const buffer = await fetchBlobBuffer(blobUrl);
    const extracted = extractZip(buffer, extractDir);

    const fileChanges: FileChange[] = changes.map((c) => {
      if (c.action === "delete") return { path: c.path, action: "delete" };
      if (c.sha) return { path: c.path, action: c.action, sha: c.sha };
      const zipPath = c.zipPath || c.path;
      const abs = path.join(extracted.extractDir, zipPath);
      if (!abs.startsWith(extracted.extractDir) || !fs.existsSync(abs)) {
        throw new Error(`File "${zipPath}" was not found in the uploaded ZIP — try uploading it again.`);
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
    await del(blobPathname).catch(() => {});
  }
}
