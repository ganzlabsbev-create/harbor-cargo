import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { del } from "@vercel/blob";
import { getSession } from "@/lib/session";
import { extractZip } from "@/lib/zip";
import { detectFramework } from "@/lib/framework-detect";
import { fetchBlobBuffer } from "@/lib/blob-fetch";

/**
 * Analyze-only step. The ZIP lives in Vercel Blob storage (uploaded directly
 * from the browser — see components/UploadZone.tsx), so this route just
 * fetches its bytes, extracts into an ephemeral /tmp dir for the duration of
 * THIS request only, and runs framework detection. The blob itself is left
 * in place — the client reuses the same blob for the push step next — and
 * gets deleted there. If analysis fails, there's nothing left to keep it
 * for, so it's deleted here instead.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const blobUrl = body?.blobUrl;
  const blobPathname = body?.blobPathname;
  if (!blobUrl || !blobPathname) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-${nanoid()}`);
  try {
    const buffer = await fetchBlobBuffer(blobUrl);
    let extracted;
    try {
      extracted = extractZip(buffer, extractDir);
    } catch {
      await del(blobPathname).catch(() => {});
      return NextResponse.json(
        { ok: false, error: "invalid_zip", detail: "This file couldn't be read as a ZIP. Try re-uploading it." },
        { status: 400 }
      );
    }
    const detection = detectFramework(extracted.extractDir, extracted.packageJson);

    return NextResponse.json({
      ok: true,
      framework: detection.framework,
      buildCommand: detection.buildCommand,
      fileCount: extracted.fileCount,
      tree: extracted.tree,
    });
  } catch (err: any) {
    await del(blobPathname).catch(() => {});
    return NextResponse.json({ ok: false, error: "analyze_failed", detail: String(err?.message || err) }, { status: 500 });
  } finally {
    fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }
}
