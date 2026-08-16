import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { del } from "@vercel/blob";
import { getSession } from "@/lib/session";
import { extractZip, listAllFiles } from "@/lib/zip";
import { detectFramework } from "@/lib/framework-detect";
import { createRepoIfNeeded, pushFilesToRepo, sanitizeRepoName, GitHubApiError } from "@/lib/github";
import { recordProjectPush } from "@/lib/db";
import { fetchBlobBuffer } from "@/lib/blob-fetch";

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
  try {
    const buffer = await fetchBlobBuffer(blobUrl);
    let extracted;
    try {
      extracted = extractZip(buffer, extractDir);
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_zip", detail: "This file couldn't be read as a ZIP. Try re-uploading it." },
        { status: 400 }
      );
    }
    if (extracted.warnings.oversizedFiles.length > 0) {
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

    const detection = detectFramework(extracted.extractDir, extracted.packageJson);
    const relativeFiles = listAllFiles(extracted.extractDir);

    if (mode === "new") {
      const rawName = String(body?.repoName || "");
      const repoName = sanitizeRepoName(rawName);
      const isPrivate = String(body?.private) !== "false";
      if (!repoName) return NextResponse.json({ ok: false, error: "invalid_repo_name" }, { status: 400 });

      const { owner, repo } = await createRepoIfNeeded(session.token, session.login, repoName, isPrivate);
      const repoUrl = await pushFilesToRepo(session.token, owner, repo, extracted.extractDir, relativeFiles);

      await recordProjectPush({
        id: nanoid(),
        user_id: session.userId,
        project_name: repoName,
        repo_url: repoUrl,
        framework: detection.framework,
      }).catch(() => {});

      return NextResponse.json({ ok: true, repoUrl });
    }

    if (mode === "update") {
      const owner = String(body?.owner || "");
      const repo = String(body?.repo || "");
      const commitMessage = String(body?.commitMessage || "Update via HARBOR CARGO");
      if (!owner || !repo) return NextResponse.json({ ok: false, error: "missing_repo_target" }, { status: 400 });

      const repoUrl = await pushFilesToRepo(session.token, owner, repo, extracted.extractDir, relativeFiles, commitMessage);

      await recordProjectPush({
        id: nanoid(),
        user_id: session.userId,
        project_name: repo,
        repo_url: repoUrl,
        framework: detection.framework,
      }).catch(() => {});

      return NextResponse.json({ ok: true, commitUrl: repoUrl });
    }

    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  } catch (err: any) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status >= 400 ? err.status : 500 });
    }
    return NextResponse.json({ ok: false, error: "push_failed", detail: String(err?.message || err) }, { status: 500 });
  } finally {
    fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await del(blobPathname).catch(() => {});
  }
}
