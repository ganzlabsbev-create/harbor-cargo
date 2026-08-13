import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/session";
import { extractZip, listAllFiles } from "@/lib/zip";
import { getRepoTree } from "@/lib/github";

/**
 * Computes a 3-way diff between the uploaded ZIP and the selected repo/branch:
 * modified (path in both), zipOnly/"add" (only in zip), repoOnly/"unchanged"
 * (only in repo, candidate for deletion). Diffing is by path presence only,
 * not content hash — matches the original tool's behavior.
 *
 * The ZIP itself is extracted to /tmp only for the life of this request and
 * discarded — the client keeps the File in memory and re-sends it on
 * /api/commit-diff once the user picks which changes to apply.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const owner = String(formData.get("owner") || "").trim();
  const repo = String(formData.get("repo") || "").trim();
  const branch = String(formData.get("branch") || "").trim();

  if (!owner || !repo || !branch) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-diff-${nanoid()}`);
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = extractZip(buffer, extractDir);
    const zipFiles = listAllFiles(extracted.extractDir);

    if (zipFiles.length === 0) {
      return NextResponse.json({ ok: false, error: "empty_zip" }, { status: 400 });
    }

    const repoTree = await getRepoTree(session.token, owner, repo, branch);
    const repoPaths = new Set(repoTree.map((f) => f.path));
    const zipPaths = new Set(zipFiles);

    const isSafePath = (p: string) => !p.startsWith("/") && !p.split("/").includes("..");

    const modified = zipFiles.filter((p) => repoPaths.has(p)).filter(isSafePath).sort();
    const zipOnly = zipFiles.filter((p) => !repoPaths.has(p)).filter(isSafePath).sort();
    const repoOnly = [...repoPaths].filter((p) => !zipPaths.has(p)).filter(isSafePath).sort();

    return NextResponse.json({
      ok: true,
      repoEmpty: repoTree.length === 0,
      diff: { modified, zipOnly, repoOnly },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "diff_failed", detail: String(err?.message || err) }, { status: 500 });
  } finally {
    fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }
}
