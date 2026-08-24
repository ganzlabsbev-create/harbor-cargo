import { test } from "node:test";
import assert from "node:assert/strict";
import { extractZipClientWithWarnings, ZipLimitError, MAX_SINGLE_FILE_BYTES, MAX_FILE_COUNT } from "../../client-zip";

// jszip's Node build works fine under tsx for these tests even though the
// module is normally used client-side in the browser.
async function buildZip(entries: Record<string, string | Uint8Array>): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  const buf: Buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

test("extracts a normal small project", async () => {
  const zipBytes = await buildZip({
    "package.json": JSON.stringify({ name: "demo" }),
    "index.html": "<html><head></head><body></body></html>",
    "src/main.js": "console.log(1)",
  });
  const { files, warnings } = await extractZipClientWithWarnings(zipBytes);
  const paths = files.map((f) => f.path).sort();
  assert.deepEqual(paths, ["index.html", "package.json", "src/main.js"]);
  assert.equal(warnings.skippedUnsafePaths.length, 0);
});

test("strips a single wrapping root folder (GitHub-style download)", async () => {
  const zipBytes = await buildZip({
    "myrepo-main/package.json": "{}",
    "myrepo-main/src/index.ts": "export {}",
  });
  const { files } = await extractZipClientWithWarnings(zipBytes);
  const paths = files.map((f) => f.path).sort();
  assert.deepEqual(paths, ["package.json", "src/index.ts"]);
});

test("preserves a lone top-level folder that isn't a wrapped project root", async () => {
  // No package.json/index.html directly inside "lib/" — this is a real
  // folder the upload is meant to keep, not a GitHub-zip-style wrapper
  // that happens to look identical structurally (regression test for the
  // "lib/github.ts becomes github.ts at the root" bug).
  const zipBytes = await buildZip({
    "lib/github.ts": "export {}",
  });
  const { files } = await extractZipClientWithWarnings(zipBytes);
  const paths = files.map((f) => f.path).sort();
  assert.deepEqual(paths, ["lib/github.ts"]);
});

test("rejects absolute-path entries instead of writing outside the project", async () => {
  // Note: jszip's own loader already collapses plain "../" sequences via an
  // internal path-resolve step before we ever see entry names (verified
  // against the actual installed jszip: "../../evil.txt" arrives here
  // already flattened to "evil.txt"). It does NOT neutralize absolute
  // paths or drive letters, though — those are the vectors that actually
  // reach our code unmodified, so that's what this test exercises. Our own
  // normalizeEntryPath still rejects ".." defensively too, in case that
  // upstream behavior ever changes (see path-security.test.ts).
  const zipBytes = await buildZip({
    "package.json": "{}",
    "/etc/evil.txt": "pwned",
    "C:\\evil.js": "pwned2",
  });
  const { files, warnings } = await extractZipClientWithWarnings(zipBytes);
  assert.ok(!files.some((f) => f.path.includes("evil")), "absolute-path / drive-letter entries must never appear in extracted files");
  assert.ok(warnings.skippedUnsafePaths.length >= 1);
});

test("ignores node_modules/.git/dist entries", async () => {
  const zipBytes = await buildZip({
    "package.json": "{}",
    "node_modules/leftpad/index.js": "module.exports = {}",
    ".git/HEAD": "ref: refs/heads/main",
    "dist/bundle.js": "// built output",
  });
  const { files } = await extractZipClientWithWarnings(zipBytes);
  const paths = files.map((f) => f.path);
  assert.deepEqual(paths, ["package.json"]);
});

test("rejects a single file over the size limit", async () => {
  const zipBytes = await buildZip({
    "package.json": "{}",
    "huge.bin": new Uint8Array(MAX_SINGLE_FILE_BYTES + 1),
  });
  await assert.rejects(() => extractZipClientWithWarnings(zipBytes), (err: unknown) => {
    assert.ok(err instanceof ZipLimitError);
    assert.equal(err.code, "file_too_large");
    return true;
  });
});

test("rejects an archive with too many files", async () => {
  const entries: Record<string, string> = {};
  for (let i = 0; i < MAX_FILE_COUNT + 1; i++) {
    entries[`f${i}.txt`] = "x";
  }
  const zipBytes = await buildZip(entries);
  await assert.rejects(() => extractZipClientWithWarnings(zipBytes), (err: unknown) => {
    assert.ok(err instanceof ZipLimitError);
    assert.equal(err.code, "too_many_files");
    return true;
  });
});

test("rejects a decompression-bomb-shaped single entry (huge ratio)", async () => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  // 20MB of a single repeated byte compresses to almost nothing with
  // DEFLATE, giving a very high ratio — representative of a bomb entry.
  zip.file("bomb.txt", new Uint8Array(20 * 1024 * 1024).fill(65), { compression: "DEFLATE" });
  const buf: Buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const zipBytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  await assert.rejects(() => extractZipClientWithWarnings(zipBytes), (err: unknown) => {
    assert.ok(err instanceof ZipLimitError);
    assert.ok(err.code === "suspicious_compression_ratio" || err.code === "file_too_large");
    return true;
  });
});
