import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/session";
import { extractZip, listAllFiles } from "@/lib/zip";
import { detectFramework } from "@/lib/framework-detect";
import { createRepoIfNeeded, pushFilesToRepo, sanitizeRepoName } from "@/lib/github";
import { recordProjectPush } from "@/lib/db";

/**
 * Receives the ZIP again (re-sent from client state, per section 2.3) plus
 * the push target, extracts it fresh in /tmp, and pushes via the Git Data
 * API using the caller's own OAuth token.
 *
 * mode="new"    -> repoName, private
 * mode="update" -> owner, repo, branch, commitMessage
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const mode = formData.get("mode");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-push-${nanoid()}`);
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = extractZip(buffer, extractDir);
    const detection = detectFramework(extracted.extractDir, extracted.packageJson);
    const relativeFiles = listAllFiles(extracted.extractDir);

    if (mode === "new") {
      const rawName = String(formData.get("repoName") || "");
      const repoName = sanitizeRepoName(rawName);
      const isPrivate = String(formData.get("private")) !== "false";
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
      const owner = String(formData.get("owner") || "");
      const repo = String(formData.get("repo") || "");
      const commitMessage = String(formData.get("commitMessage") || "Update via HARBOR CARGO");
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
    return NextResponse.json({ ok: false, error: "push_failed", detail: String(err?.message || err) }, { status: 500 });
  } finally {
    fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }
}
