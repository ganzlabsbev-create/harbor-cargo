import { test } from "node:test";
import assert from "node:assert/strict";
import { detectManifest } from "../detect/manifest";
import type { ProjectTextFile } from "../detect/service-worker-detect";

const VALID_MANIFEST = JSON.stringify({
  name: "My App",
  short_name: "App",
  start_url: "/",
  display: "standalone",
  icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }],
});

test("linked manifest.json is detected with high confidence", () => {
  const files: ProjectTextFile[] = [
    { path: "public/manifest.json", text: VALID_MANIFEST },
    { path: "index.html", text: `<head><link rel="manifest" href="/manifest.json"></head>` },
  ];
  const result = detectManifest(files);
  assert.equal(result.path, "public/manifest.json");
  assert.equal(result.confidence, "high");
  assert.equal(result.linked, true);
});

test("Next.js metadata.manifest reference resolves the linked manifest", () => {
  const files: ProjectTextFile[] = [
    { path: "public/manifest.webmanifest", text: VALID_MANIFEST },
    { path: "app/layout.tsx", text: `export const metadata = { manifest: "/manifest.webmanifest" };` },
  ];
  const result = detectManifest(files);
  assert.equal(result.path, "public/manifest.webmanifest");
  assert.equal(result.linked, true);
  assert.equal(result.linkedFrom, "app/layout.tsx");
});

test("docs/manifest.json with no relationship to the app is not treated as the application manifest", () => {
  const files: ProjectTextFile[] = [{ path: "docs/manifest.json", text: VALID_MANIFEST }];
  const result = detectManifest(files);
  assert.equal(result.confidence, "low");
});

test("malformed JSON manifest is reported but not crashed on", () => {
  const files: ProjectTextFile[] = [{ path: "public/manifest.json", text: "{ not valid json" }];
  const result = detectManifest(files);
  assert.equal(result.candidates[0].parses, false);
  assert.equal(result.confidence, "low");
});

test("multiple manifest files: linked one wins over an unlinked example", () => {
  const files: ProjectTextFile[] = [
    { path: "public/manifest.json", text: VALID_MANIFEST },
    { path: "examples/manifest.json", text: VALID_MANIFEST },
    { path: "index.html", text: `<link rel="manifest" href="/manifest.json">` },
  ];
  const result = detectManifest(files);
  assert.equal(result.path, "public/manifest.json");
});
