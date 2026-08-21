import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { detectServiceWorker } from "../detect/service-worker-detect";
import { detectManifest } from "../detect/manifest";
import { loadProjectTextFiles } from "./test-helpers";

const REPO_ROOT = path.resolve(__dirname, "../../.."); // lib/pwa/__tests__ -> repo root

test("Harbor Cargo regression: lib/pwa/service-worker.ts is not detected as an active Service Worker", () => {
  const files = loadProjectTextFiles(REPO_ROOT);
  const result = detectServiceWorker(files);

  assert.notEqual(result.path, "lib/pwa/service-worker.ts", "the generator source must never be chosen as the active SW");

  const genCandidate = result.candidates.find((c) => c.path === "lib/pwa/service-worker.ts");
  assert.ok(genCandidate, "lib/pwa/service-worker.ts should still show up as a reported candidate");
  assert.equal(genCandidate!.sourceType, "generator-source");

  // Harbor Cargo's own source has no real navigator.serviceWorker.register()
  // call anywhere outside the generator templates — so there should be no
  // active SW at all in this project as shipped.
  assert.equal(result.path, null);
  assert.equal(result.registered, false);
});

test("Harbor Cargo regression: existing manifest is detected and correctly linked from app/layout.tsx", () => {
  const files = loadProjectTextFiles(REPO_ROOT);
  const result = detectManifest(files);

  assert.equal(result.path, "public/manifest.webmanifest");
  assert.equal(result.linked, true);
  assert.equal(result.linkedFrom, "app/layout.tsx");
  assert.notEqual(result.confidence, "low");
});
