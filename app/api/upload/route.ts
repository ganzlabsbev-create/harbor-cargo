import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/session";
import { extractZip } from "@/lib/zip";
import { detectFramework } from "@/lib/framework-detect";

/**
 * Analyze-only step. Extracts the ZIP into an ephemeral /tmp dir for the
 * duration of THIS request only, runs framework detection, and returns the
 * result. Nothing is kept on the server after the response is sent — the
 * client hangs onto the original File in memory and re-uploads it on the
 * actual push request. See build spec section 2.3 (no Vercel Blob).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }

  const extractDir = path.join(os.tmpdir(), `harbor-${nanoid()}`);
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = extractZip(buffer, extractDir);
    const detection = detectFramework(extracted.extractDir, extracted.packageJson);

    return NextResponse.json({
      ok: true,
      framework: detection.framework,
      buildCommand: detection.buildCommand,
      fileCount: extracted.fileCount,
      tree: extracted.tree,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "analyze_failed", detail: String(err?.message || err) }, { status: 500 });
  } finally {
    fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }
}
