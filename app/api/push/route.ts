import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { del } from "@vercel/blob";
import { getSession } from "@/lib/session";
import { extractZip, listAllFiles, ExtractedProject } from "@/lib/zip";
import { detectFramework } from "@/lib/framework-detect";
import { createRepoIfNeeded, pushFilesToRepo, sanitizeRepoName, GitHubApiError } from "@/lib/github";
import { recordProjectPush } from "@/lib/db";
import { fetchBlobBuffer } from "@/lib/blob-fetch";

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

/**
 * Reads the already-uploaded ZIP from Blob storage (see
 * components/UploadZone.tsx and /api/upload) plus the push target, extracts
 * it fresh in /tmp, and pushes via the Git Data API using the caller's own
 * OAuth token. The blob is always deleted once this request is done with
 * it — success or failure — so nothing lingers in storage; a failed push
 * means the ZIP has to be re-uploaded to retry.
 *
 * mode="new"    -> repoName, private
 * mode="update" -> owner, repo, branch, commitMessage
 *
 * Streams NDJSON once the real work (the blob-upload loop in
 * pushFilesToRepo) begins, so the client can render true per-blob progress
 * instead of waiting on one opaque response — see
 * app/tools/github/new/page.tsx and app/tools/github/update/page.tsx.
 * Everything that can fail before that loop starts (auth, invalid ZIP,
 * oversized files, bad mode/fields) still returns a normal, non-streamed
 * JSON response immediately.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const blobUrl = body?.blobUrl;
  const blobPathname = body?.blobPathname;
  const mode = body?.mode;
  if (!blobUrl || !blobPathname) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-push-${nanoid()}`);
  async function cleanup() {
    await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await del(blobPathname).catch(() => {});
  }

  // --- Pre-loop setup & validation: still a normal, non-streamed response
  // on any failure here, since the blob-upload loop hasn't started yet. ---
  let extracted: ExtractedProject;
  let relativeFiles: string[];
  let detection: ReturnType<typeof detectFramework>;
  try {
    const buffer = await fetchBlobBuffer(blobUrl);
    try {
      extracted = extractZip(buffer, extractDir);
    } catch {
      await cleanup();
      return NextResponse.json(
        { ok: false, error: "invalid_zip", detail: "This file couldn't be read as a ZIP. Try re-uploading it." },
        { status: 400 }
      );
    }
    if (extracted.warnings.oversizedFiles.length > 0) {
      await cleanup();
      return NextResponse.json(
        {
          ok: false,
          error: "file_too_large",
          detail: `${extracted.warnings.oversizedFiles.length === 1 ? "This file is" : "These files are"} too large for GitHub: ${extracted.warnings.oversizedFiles.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const isSafeRelPath = (p: unknown): p is string =>
      typeof p === "string" && p.length > 0 && !p.startsWith("/") && !p.split("/").includes("..");

    // Files dropped via "replace" on a drag-collision (see
    // components/ConfirmMoveDialog.tsx / EditableTreeView.tsx) — deleted
    // first, before moves are applied, so the file that replaced them can
    // actually take that spot (moves below skip a rename whose destination
    // is already occupied).
    const excludePaths: string[] = Array.isArray(body?.excludePaths) ? body.excludePaths : [];
    for (const p of excludePaths) {
      if (!isSafeRelPath(p)) continue;
      const target = path.join(extracted.extractDir, p);
      if (!target.startsWith(extracted.extractDir)) continue;
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }

    // Apply any client-side drag-to-move renames before building the file
    // list to push — see components/EditableTreeView.tsx. Both sides are
    // validated so a crafted request can't write outside extractDir.
    const moves: Array<{ from: string; to: string }> = Array.isArray(body?.moves) ? body.moves : [];
    for (const mv of moves) {
      if (!isSafeRelPath(mv?.from) || !isSafeRelPath(mv?.to)) continue;
      const src = path.join(extracted.extractDir, mv.from);
      const dest = path.join(extracted.extractDir, mv.to);
      if (!src.startsWith(extracted.extractDir) || !dest.startsWith(extracted.extractDir)) continue;
      if (!fs.existsSync(src) || fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
    }

    detection = detectFramework(extracted.extractDir, extracted.packageJson);
    relativeFiles = listAllFiles(extracted.extractDir);
  } catch (err: any) {
    await cleanup();
    return NextResponse.json({ ok: false, error: "push_failed", detail: String(err?.message || err) }, { status: 500 });
  }

  if (mode !== "new" && mode !== "update") {
    await cleanup();
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }

  let repoName = "";
  let isPrivate = true;
  if (mode === "new") {
    repoName = sanitizeRepoName(String(body?.repoName || ""));
    isPrivate = String(body?.private) !== "false";
    if (!repoName) {
      await cleanup();
      return NextResponse.json({ ok: false, error: "invalid_repo_name" }, { status: 400 });
    }
  }

  let updateOwner = "";
  let updateRepo = "";
  let commitMessage = "Update via HARBOR CARGO";
  if (mode === "update") {
    // NOTE: nothing in the app calls this branch anymore. pushFilesToRepo
    // builds a brand-new tree with no base_tree and force-pushes it —
    // correct for "new" (nothing to preserve on an empty repo), but wrong
    // for updating an existing one, since it silently deletes every repo
    // file that wasn't in the uploaded ZIP. components/CaptainHarbor.tsx
    // used to call this for its "update" flow; it now posts to
    // /api/commit-diff instead (scoped, base_tree-based — same endpoint
    // app/tools/github/update/page.tsx already used). Left in place
    // rather than removed in case something needs a deliberate full
    // replace in the future, but treat this as mode="new"-only in practice.
    updateOwner = String(body?.owner || "");
    updateRepo = String(body?.repo || "");
    commitMessage = String(body?.commitMessage || commitMessage);
    if (!updateOwner || !updateRepo) {
      await cleanup();
      return NextResponse.json({ ok: false, error: "missing_repo_target" }, { status: 400 });
    }
  }

  // --- Streaming phase: the blob-upload loop (the real, measurable unit of
  // progress) starts here. One JSON line per event. ---
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (mode === "new") {
          const { owner, repo } = await createRepoIfNeeded(session.token, session.login, repoName, isPrivate);
          const repoUrl = await pushFilesToRepo(
            session.token,
            owner,
            repo,
            extracted.extractDir,
            relativeFiles,
            undefined,
            (current, total) => controller.enqueue(ndjson({ type: "progress", current, total }))
          );

          await recordProjectPush({
            id: nanoid(),
            user_id: session.userId,
            project_name: repoName,
            repo_url: repoUrl,
            framework: detection.framework,
          }).catch(() => {});

          controller.enqueue(ndjson({ type: "done", ok: true, repoUrl }));
        } else {
          const repoUrl = await pushFilesToRepo(
            session.token,
            updateOwner,
            updateRepo,
            extracted.extractDir,
            relativeFiles,
            commitMessage,
            (current, total) => controller.enqueue(ndjson({ type: "progress", current, total }))
          );

          await recordProjectPush({
            id: nanoid(),
            user_id: session.userId,
            project_name: updateRepo,
            repo_url: repoUrl,
            framework: detection.framework,
          }).catch(() => {});

          controller.enqueue(ndjson({ type: "done", ok: true, commitUrl: repoUrl }));
        }
      } catch (err: any) {
        if (err instanceof GitHubApiError) {
          controller.enqueue(ndjson({ type: "done", ok: false, error: err.code, detail: err.message }));
        } else {
          controller.enqueue(ndjson({ type: "done", ok: false, error: "push_failed", detail: String(err?.message || err) }));
        }
      } finally {
        await cleanup();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
