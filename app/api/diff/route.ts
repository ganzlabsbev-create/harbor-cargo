import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { del } from "@vercel/blob";
import { getSession } from "@/lib/session";
import { extractZip, listAllFiles } from "@/lib/zip";
import { getRepoTree } from "@/lib/github";
import { fetchBlobBuffer } from "@/lib/blob-fetch";

/**
 * Computes a 3-way diff between the uploaded ZIP and the selected repo/branch:
 * modified (path in both), zipOnly/"add" (only in zip), repoOnly/"unchanged"
 * (only in repo, candidate for deletion). Diffing is by path presence only,
 * not content hash — matches the original tool's behavior.
 *
 * The ZIP is read from Blob storage (see components/UploadZone.tsx) and
 * extracted to /tmp only for the life of this request. The blob itself is
 * left in place — /api/commit-diff reuses it once the user picks which
 * changes to apply, and deletes it there — unless the diff fails, in which
 * case it's deleted here since nothing further will use it.
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

  if (!owner || !repo || !branch) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!blobUrl || !blobPathname) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-diff-${nanoid()}`);
  try {
    const buffer = await fetchBlobBuffer(blobUrl);
    const extracted = extractZip(buffer, extractDir);
    const zipFiles = listAllFiles(extracted.extractDir);

    if (zipFiles.length === 0) {
      await del(blobPathname).catch(() => {});
      return NextResponse.json({ ok: false, error: "empty_zip" }, { status: 400 });
    }

    const repoTree = await getRepoTree(session.token, owner, repo, branch);
    const repoPaths = new Set(repoTree.map((f) => f.path));
    const zipPaths = new Set(zipFiles);

    const isSafePath = (p: string) => !p.startsWith("/") && !p.split("/").includes("..");

    const modified = zipFiles.filter((p) => repoPaths.has(p)).filter(isSafePath).sort();
    const zipOnly = zipFiles.filter((p) => !repoPaths.has(p)).filter(isSafePath).sort();
    const repoShaByPath = new Map(repoTree.map((f) => [f.path, f.sha]));
    // repoOnly carries each file's current blob sha alongside its path —
    // needed so a repo-side rename (dragging one of these into a folder
    // without ever touching its content) can reuse the existing blob
    // instead of round-tripping the file's bytes through the client.
    const repoOnly = [...repoPaths]
      .filter((p) => !zipPaths.has(p))
      .filter(isSafePath)
      .sort()
      .map((p) => ({ path: p, sha: repoShaByPath.get(p)! }));

    return NextResponse.json({
      ok: true,
      repoEmpty: repoTree.length === 0,
      diff: { modified, zipOnly, repoOnly },
      warnings: extracted.warnings,
    });
  } catch (err: any) {
    await del(blobPathname).catch(() => {});
    return NextResponse.json({ ok: false, error: "diff_failed", detail: String(err?.message || err) }, { status: 500 });
  } finally {
    fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }
}
