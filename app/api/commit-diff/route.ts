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

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

/**
 * Applies the user's selected add/replace/delete set as a single commit.
 * Reads the same blob /api/diff already looked at (see
 * components/UploadZone.tsx) plus the change list decided on the diff
 * screen. Unselected files are left untouched in the repo, since
 * commitFileChanges builds on top of the branch's current tree (base_tree).
 * The blob is deleted once the commit succeeds — but left in place on any
 * failure, so a retry (e.g. after a transient GitHub error) can run against
 * the same blob instead of forcing the user to re-upload the ZIP.
 *
 * Streams NDJSON once the real work (the blob-upload loop in
 * commitFileChanges) begins, so the client can render true per-blob
 * progress — see app/tools/github/update/page.tsx. Validation failures
 * before that loop starts still return a normal, non-streamed JSON
 * response immediately.
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
    // Don't delete the blob here — this is a client-side validation failure,
    // not a used-up upload, and the blob is still good for a corrected retry.
    return NextResponse.json({ ok: false, error: "no_changes" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-commitdiff-${nanoid()}`);

  // --- Pre-loop setup: still a normal, non-streamed response on failure,
  // since the blob-upload loop hasn't started yet. ---
  let fileChanges: FileChange[];
  try {
    const buffer = await fetchBlobBuffer(blobUrl);
    const extracted = extractZip(buffer, extractDir);

    fileChanges = changes.map((c) => {
      if (c.action === "delete") return { path: c.path, action: "delete" };
      if (c.sha) return { path: c.path, action: c.action, sha: c.sha };
      const zipPath = c.zipPath || c.path;
      const abs = path.join(extracted.extractDir, zipPath);
      if (!abs.startsWith(extracted.extractDir) || !fs.existsSync(abs)) {
        throw new Error(`File "${zipPath}" was not found in the uploaded ZIP — try uploading it again.`);
      }
      return { path: c.path, action: c.action, content: fs.readFileSync(abs) };
    });
  } catch (err: any) {
    // Local temp dir only — the blob stays put on any pre-loop failure so a
    // retry doesn't 404 fetching it again.
    fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json({ ok: false, error: "commit_failed", detail: String(err?.message || err) }, { status: 500 });
  }

  // --- Streaming phase: the blob-upload loop (the real, measurable unit of
  // progress) starts here. One JSON line per event. ---
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const commitUrl = await commitFileChanges(
          session.token,
          owner,
          repo,
          branch,
          fileChanges,
          commitMessage,
          (current, total) => controller.enqueue(ndjson({ type: "progress", current, total }))
        );

        await recordProjectPush({
          id: nanoid(),
          user_id: session.userId,
          project_name: repo,
          repo_url: commitUrl,
          framework: null,
        }).catch(() => {});

        // Only delete the blob once the commit has actually succeeded — on
        // failure it needs to stay put so a retry doesn't 404 fetching it
        // again.
        await del(blobPathname).catch(() => {});

        controller.enqueue(ndjson({ type: "done", ok: true, commitUrl }));
      } catch (err: any) {
        controller.enqueue(ndjson({ type: "done", ok: false, error: "commit_failed", detail: String(err?.message || err) }));
      } finally {
        // Local temp dir only — unrelated to the blob-retry concern above,
        // so this can always be cleaned up regardless of outcome.
        fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
