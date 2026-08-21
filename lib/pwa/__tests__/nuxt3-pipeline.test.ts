import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePwaPackage } from "../build";
import type { ProjectAnalysis, ClientFile } from "../types";
import { installFakeCanvasEnvironment, makeFakeIconImage, makeTestFormState } from "./test-helpers";

// Regression coverage for runNuxt3(), which — unlike next-app-router and
// html-shell — had no dedicated test at all before this: nobody had run the
// full pipeline against a real Nuxt 3 project, which is exactly why the
// missing recordPlan() for plugins/harbor-pwa-sw.client.ts went unnoticed
// (see build.ts history).

installFakeCanvasEnvironment();

const enc = new TextEncoder();

function makeNuxtConfigFile(): ClientFile {
  const code = `export default defineNuxtConfig({
  devtools: { enabled: true },
});
`;
  return { path: "nuxt.config.ts", ext: "ts", bytes: enc.encode(code) };
}

function makeNuxt3Analysis(files: ClientFile[]): ProjectAnalysis {
  return {
    fileCount: files.length,
    totalBytes: files.reduce((s, f) => s + f.bytes.byteLength, 0),
    framework: "Nuxt 3",
    frameworkConfidence: 1,
    frameworkEvidence: ["nuxt.config.ts present"],
    needsBuild: true,
    strategy: "nuxt3",
    entryHtmlPath: null,
    entryHtmlNeedsCreate: false,
    configFilePath: "nuxt.config.ts",
    strategyNote: null,
    hasPackageJson: false,
    existingManifestPath: null,
    existingServiceWorkerPath: null,
    existingServiceWorker: { path: null, confidence: null, sourceType: null, registered: false, registrationTarget: null, candidates: [], registrations: [], diagnostics: [] },
    existingManifest: { path: null, confidence: null, linked: false, linkedFrom: null, candidates: [], diagnostics: [] },
    hasIcons: false,
    assetRoot: "public",
    suggestedStartUrl: "/",
    suggestedAppName: "Test App",
    suggestedDescription: "",
  };
}

test("Nuxt 3 pipeline: generatePwaPackage() succeeds and plans the SW client plugin correctly", async () => {
  const files = [makeNuxtConfigFile()];
  const analysis = makeNuxt3Analysis(files);
  const form = makeTestFormState();
  const iconImage = makeFakeIconImage() as unknown as HTMLImageElement;

  const result = await generatePwaPackage({ files, analysis, form, iconImage });

  // Before the fix: this threw PwaValidationError("unplanned_create") for
  // plugins/harbor-pwa-sw.client.ts, because runNuxt3() wrote the file via
  // put() without a matching ctx.recordPlan() call.
  assert.ok(result.zipBlob);

  const pluginEntry = result.mutationPlan.find((e) => e.path === "plugins/harbor-pwa-sw.client.ts");
  assert.ok(pluginEntry, "mutation plan must have an entry for the Nuxt client SW plugin");
  assert.equal(pluginEntry!.action, "CREATE");
  assert.ok(result.added.includes("plugins/harbor-pwa-sw.client.ts"));

  // Manifest, service worker, and nuxt.config itself should also be planned.
  assert.ok(result.mutationPlan.some((e) => e.path === "public/manifest.json" && e.action === "CREATE"));
  assert.ok(result.mutationPlan.some((e) => e.path === "public/service-worker.js" && e.action === "CREATE"));
  assert.ok(result.mutationPlan.some((e) => e.path === "nuxt.config.ts" && e.action === "UPDATE"));
});

test("Nuxt 3 pipeline: re-running on an already-generated project updates (not re-creates) the SW plugin", async () => {
  const files = [makeNuxtConfigFile()];
  const analysis1 = makeNuxt3Analysis(files);
  const form = makeTestFormState();
  const iconImage = makeFakeIconImage() as unknown as HTMLImageElement;

  const first = await generatePwaPackage({ files, analysis: analysis1, form, iconImage });

  // Rather than unzip the returned Blob, build the "files after first run"
  // set directly from what we know was added — this still exercises the
  // existedNuxtSwPlugin === true branch of the fix (a second run seeing a
  // plugin file already on disk).
  const pluginPath = "plugins/harbor-pwa-sw.client.ts";
  assert.ok(first.added.includes(pluginPath));

  const filesAfterFirstRun: ClientFile[] = [
    makeNuxtConfigFile(),
    { path: pluginPath, ext: "ts", bytes: enc.encode("// pre-existing plugin content") },
  ];
  const analysis2 = makeNuxt3Analysis(filesAfterFirstRun);
  const second = await generatePwaPackage({ files: filesAfterFirstRun, analysis: analysis2, form: makeTestFormState({ replaceServiceWorker: true }), iconImage });

  const pluginEntry2 = second.mutationPlan.find((e) => e.path === pluginPath);
  assert.ok(pluginEntry2);
  assert.equal(pluginEntry2!.action, "UPDATE", "an already-existing plugin file must be planned as UPDATE, not CREATE");
  assert.ok(second.updated.includes(pluginPath));
});
