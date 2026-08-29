import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getRepoTree, getBlobContent, GitHubApiError } from "@/lib/github";
import { isLikelyTextFile } from "@/lib/code-lang";

/**
 * "Deep search" corpus fetch (build spec: full-text code search that
 * doesn't rely on GitHub's index). Streams every text file's content once
 * — the client caches it and then filters/searches it entirely locally on
 * every keystroke, so a search after the initial fetch feels instant,
 * without hitting the network again.
 *
 * Same fetch pattern (and the same reasoning for the caps) as
 * code/download/route.ts's Download Project: buffering a whole repo in
 * one request has to have a ceiling, and progress has to stream so the UI
 * never looks frozen on a big repo (spec section 12/18).
 */

const MAX_CORPUS_FILES = 3000;
const MAX_CORPUS_BYTES = 60 * 1024 * 1024; // deep search corpus is smaller than Download's cap — this stays in a browser tab's memory
const MAX_SINGLE_FILE_BYTES = 512 * 1024; // a single huge minified file isn't useful to full-text search anyway

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

export async function GET(req: NextRequest, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: "not_authenticated" }), { status: 401 });
  }

  const branch = req.nextUrl.searchParams.get("branch");
  if (!branch) return new Response(JSON.stringify({ ok: false, error: "missing_branch" }), { status: 400 });

  const { owner, repo } = params;
  const token = session.token;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(ndjson({ type: "status", stage: "preparing" }));
        const tree = await getRepoTree(token, owner, repo, branch);
        const candidates = tree.filter((f) => isLikelyTextFile(f.path, 0)).slice(0, MAX_CORPUS_FILES);

        controller.enqueue(ndjson({ type: "status", stage: "fetching", total: candidates.length }));

        let totalBytes = 0;
        let completed = 0;
        for (const file of candidates) {
          const content = await getBlobContent(token, owner, repo, file.sha);
          completed++;
          if (content.length > MAX_SINGLE_FILE_BYTES) {
            controller.enqueue(ndjson({ type: "progress", current: completed, total: candidates.length }));
            continue;
          }
          totalBytes += content.length;
          if (totalBytes > MAX_CORPUS_BYTES) {
            controller.enqueue(
              ndjson({
                type: "done",
                ok: true,
                truncated: true,
                detail: "This repo is too large to search entirely — results below are from a partial fetch.",
              })
            );
            return;
          }
          // NUL-byte heuristic same as getFileContent's binary check —
          // skip anything that snuck past the extension allowlist.
          const sample = content.subarray(0, Math.min(content.length, 4000));
          if (sample.includes(0)) {
            controller.enqueue(ndjson({ type: "progress", current: completed, total: candidates.length }));
            continue;
          }
          controller.enqueue(ndjson({ type: "file", path: file.path, content: content.toString("utf8") }));
          controller.enqueue(ndjson({ type: "progress", current: completed, total: candidates.length }));
        }

        controller.enqueue(ndjson({ type: "done", ok: true, truncated: false }));
      } catch (err: any) {
        if (err instanceof GitHubApiError) {
          controller.enqueue(ndjson({ type: "done", ok: false, error: err.code, detail: err.message }));
        } else {
          controller.enqueue(ndjson({ type: "done", ok: false, error: "corpus_failed", detail: String(err?.message || err) }));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
