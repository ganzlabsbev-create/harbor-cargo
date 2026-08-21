import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { generatePwaPackage } from "../build";
import { analyzeProject } from "../analyze";
import { loadProjectClientFiles, installFakeCanvasEnvironment, makeFakeIconImage, makeTestFormState } from "./test-helpers";

// This is the regression the original bug report was about: the existing
// harbor-cargo-regression.test.ts only ever exercised the *detectors*
// (detectServiceWorker / detectManifest) against the Harbor Cargo project,
// never the full generatePwaPackage() pipeline — so the three
// unplanned_create/plan_mismatch bugs in build.ts (missing recordPlan calls)
// went uncaught. This test closes that gap by running the real pipeline,
// end to end, on the project's own source.
const REPO_ROOT = path.resolve(__dirname, "../../..");

installFakeCanvasEnvironment();

test("Harbor Cargo regression: generatePwaPackage() full pipeline succeeds on Harbor Cargo's own source (Next.js App Router)", async () => {
  const files = loadProjectClientFiles(REPO_ROOT);
  const analysis = analyzeProject(files);

  // Sanity-check the fixture is what we think it is before asserting on the
  // pipeline — if this ever changes (e.g. the project migrates off App
  // Router), the test should fail loudly here rather than silently stop
  // covering the branch it was written for.
  assert.equal(analysis.strategy, "next-app-router", "Harbor Cargo itself is expected to be a Next.js App Router project");
  assert.equal(analysis.configFilePath, "app/layout.tsx");

  const form = makeTestFormState({ appName: "Harbor Cargo", shortName: "Harbor" });
  const iconImage = makeFakeIconImage() as unknown as HTMLImageElement;

  const result = await generatePwaPackage({ files, analysis, form, iconImage });

  // Before the fix: this threw PwaValidationError("unplanned_create") for
  // app/harbor-register-sw.tsx, because runNextAppRouter() wrote the file
  // via put() without a matching ctx.recordPlan() call. Reaching this line
  // at all is the regression check.
  assert.ok(result.zipBlob, "pipeline must produce a zip");

  const swComponentEntry = result.mutationPlan.find((e) => e.path === "app/harbor-register-sw.tsx");
  assert.ok(swComponentEntry, "mutation plan must have an entry for the generated SW registration component");
  assert.equal(swComponentEntry!.action, "CREATE");
  assert.ok(result.added.includes("app/harbor-register-sw.tsx"));

  // The existing manifest (public/manifest.webmanifest) must be preserved by
  // default (replaceManifest defaults to false), not silently overwritten.
  const manifestEntry = result.mutationPlan.find((e) => e.path === "public/manifest.webmanifest");
  assert.ok(manifestEntry, "existing manifest must have a mutation-plan entry");
  assert.equal(manifestEntry!.action, "PRESERVE");
});
