import { NextRequest } from "next/server";
import AdmZip from "adm-zip";
import { put } from "@vercel/blob";
import { getSession } from "@/lib/session";
import { getRepoTree, getBlobContent, GitHubApiError } from "@/lib/github";

/**
 * Download Project (build spec sections 9-13).
 *
 *   fetch repo tree -> filter files -> download file contents -> create ZIP
 *   -> hand the browser a download
 *
 * Reuses the same low-level GitHub Git Data API calls the push/commit path
 * already uses (getRepoTree, blob-by-sha) instead of the Contents API, and
 * the same AdmZip dependency lib/zip.ts already uses for extraction — no
 * new GitHub client and no new ZIP dependency, per spec section 11/16.
 *
 * Streams NDJSON progress like /api/push and /api/commit-diff, since a
 * large repo can take a while and the UI must never sit with no feedback
 * (spec section 18). The finished ZIP itself doesn't fit nicely in an
 * NDJSON stream, so the final line hands back a short-lived Vercel Blob
 * URL for the client to fetch/redirect to; the client (or a sendBeacon on
 * unmount) deletes that blob afterwards via the existing
 * /api/upload/blob-cleanup route — same cleanup pattern already used for
 * abandoned uploads.
 *
 * Hard caps below exist because this buffers the whole project in one
 * serverless function's memory (spec section 12: never let a large repo
 * hang the browser or the function without feedback) — past that size the
 * response is a clear error, not a silent timeout.
 */

const MAX_DOWNLOAD_FILES = 4000;
const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function isHiddenPath(p: string): boolean {
  return p.split("/").some((seg) => seg.startsWith("."));
}

export async function POST(req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: "not_authenticated" }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const branch = String(body?.branch || "").trim();
  const scope: "repo" | "folder" = body?.scope === "folder" ? "folder" : "repo";
  const folderPath = String(body?.folderPath || "").trim().replace(/^\/+|\/+$/g, "");
  const includeHidden = body?.includeHidden !== false;
  const includeGithub = body?.includeGithub !== false;

  if (!branch) {
    return new Response(JSON.stringify({ ok: false, error: "missing_branch" }), { status: 400 });
  }
  if (scope === "folder" && !folderPath) {
    return new Response(JSON.stringify({ ok: false, error: "missing_folder" }), { status: 400 });
  }

  const { owner, repo } = params;
  const token = session.token;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(ndjson({ type: "status", stage: "preparing" }));

        const tree = await getRepoTree(token, owner, repo, branch);

        let files = tree;
        if (scope === "folder") {
          const prefix = `${folderPath}/`;
          files = files.filter((f) => f.path.startsWith(prefix));
        }
        if (!includeGithub) {
          files = files.filter((f) => !f.path.startsWith(".github/"));
        }
        if (!includeHidden) {
          files = files.filter((f) => {
            // .github is controlled separately above, so don't also drop it here.
            if (includeGithub && f.path.startsWith(".github/")) return true;
            return !isHiddenPath(f.path);
          });
        }

        if (files.length === 0) {
          controller.enqueue(ndjson({ type: "done", ok: false, error: "no_files", detail: "No files match these download options." }));
          return;
        }
        if (files.length > MAX_DOWNLOAD_FILES) {
          controller.enqueue(
            ndjson({
              type: "done",
              ok: false,
              error: "too_many_files",
              detail: `This selection has ${files.length} files, over Harbor's ${MAX_DOWNLOAD_FILES}-file download limit. Try downloading a specific folder instead.`,
            })
          );
          return;
        }

        controller.enqueue(ndjson({ type: "status", stage: "fetching", total: files.length }));

        const zip = new AdmZip();
        let totalBytes = 0;
        let completed = 0;

        for (const file of files) {
          const content = await getBlobContent(token, owner, repo, file.sha);
          totalBytes += content.length;
          if (totalBytes > MAX_DOWNLOAD_BYTES) {
            controller.enqueue(
              ndjson({
                type: "done",
                ok: false,
                error: "too_large",
                detail: "This selection is too large to download from Harbor in one ZIP. Try a specific folder instead.",
              })
            );
            return;
          }
          // Strip the folder prefix so a folder download's ZIP is rooted at
          // the folder itself, not the whole repo path.
          const zipPath = scope === "folder" ? file.path.slice(folderPath.length + 1) : file.path;
          zip.addFile(zipPath, content);
          completed++;
          controller.enqueue(ndjson({ type: "progress", current: completed, total: files.length, currentFile: file.path }));
        }

        controller.enqueue(ndjson({ type: "status", stage: "zipping" }));
        const zipBuffer = zip.toBuffer();

        controller.enqueue(ndjson({ type: "status", stage: "uploading" }));
        const zipName = `${repo}-${branch}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const blob = await put(`downloads/${zipName}-${Date.now()}.zip`, zipBuffer, {
          access: "public",
          addRandomSuffix: true,
          contentType: "application/zip",
        });

        controller.enqueue(
          ndjson({ type: "done", ok: true, blobUrl: blob.url, blobPathname: blob.pathname, filename: `${zipName}.zip`, fileCount: files.length })
        );
      } catch (err: any) {
        if (err instanceof GitHubApiError) {
          controller.enqueue(ndjson({ type: "done", ok: false, error: err.code, detail: err.message }));
        } else {
          controller.enqueue(ndjson({ type: "done", ok: false, error: "download_failed", detail: String(err?.message || err) }));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
