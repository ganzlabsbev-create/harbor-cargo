import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * Issues a short-lived client token so the browser can upload a ZIP straight
 * to Vercel Blob storage, bypassing the ~4.5MB body limit on serverless
 * functions. Generic — any future upload-based tool (not just the GitHub
 * uploader) can point at this same route. Rate limiting already happened at
 * /api/upload/rate-limit before this is ever called (see
 * components/UploadZone.tsx).
 *
 * Public: Harbor Preview and the PWA Generator upload without a GitHub
 * session (see app/tools/preview, app/tools/harbor/pwa), so this no longer
 * requires being signed in. It only stages a ZIP in Blob storage for
 * analysis — it never touches GitHub/Vercel accounts, tokens, or private
 * data, so it's safe to leave open the same way the rest of the
 * analyze-only chain is.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getSession();

        return {
          allowedContentTypes: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
          addRandomSuffix: true,
          // Generous cap for real projects, but still bounded so the
          // analyze/push step (which buffers the whole ZIP in memory) can't
          // blow up the function.
          maximumSizeInBytes: 200 * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId: session?.userId ?? null }),
        };
      },
      onUploadCompleted: async () => {
        // No bookkeeping needed here — the client calls /api/upload (or
        // /api/diff) to analyze right after this resolves, and the blob is
        // deleted again once it's been used (or abandoned — see
        // /api/upload/blob-cleanup and lib/use-blob-cleanup.ts).
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 400 });
  }
}
