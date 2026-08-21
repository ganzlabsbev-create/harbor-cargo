import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePwaPackage } from "../build";
import type { ProjectAnalysis, ClientFile } from "../types";
import { installFakeCanvasEnvironment, makeFakeIconImage, makeTestFormState } from "./test-helpers";

// Regression coverage for the PRESERVE-case middleware patch bug: when a
// project re-run through Harbor PWA already has its own manifest/service
// worker (and the user hasn't ticked Replace), the previous code only ever
// set ctx.manifestUrlUsed/ctx.serviceWorkerUrlUsed inside the
// manageManifest/manageServiceWorker branches — i.e. only when Harbor PWA
// itself created/updated the file this run. A PRESERVEd pre-existing
// manifest/SW left those fields null, so the middleware.ts auth-gate patch
// below never ran, even though the exact same public-path requirement
// applies regardless of who authored the file. These tests exercise the
// PRESERVE path (default form: replaceManifest/replaceServiceWorker both
// false) across all three strategies and assert middleware.ts still gets
// patched.

installFakeCanvasEnvironment();

const enc = new TextEncoder();

function makeMiddlewareFile(): ClientFile {
  const code = `import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();
}
`;
  return { path: "middleware.ts", ext: "ts", bytes: enc.encode(code) };
}

function findMiddlewareEntry(result: Awaited<ReturnType<typeof generatePwaPackage>>) {
  return result.mutationPlan.find((e) => e.path === "middleware.ts");
}

// ---------------------------------------------------------------------------
// html-shell
// ---------------------------------------------------------------------------

function makeHtmlShellFiles(): ClientFile[] {
  const indexHtml = `<!doctype html>
<html>
  <head>
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
  return [
    { path: "index.html", ext: "html", bytes: enc.encode(indexHtml) },
    { path: "public/manifest.json", ext: "json", bytes: enc.encode('{"name":"Existing"}') },
    { path: "public/service-worker.js", ext: "js", bytes: enc.encode("// existing sw") },
    makeMiddlewareFile(),
  ];
}

function makeHtmlShellAnalysis(files: ClientFile[]): ProjectAnalysis {
  return {
    fileCount: files.length,
    totalBytes: files.reduce((s, f) => s + f.bytes.byteLength, 0),
    framework: "Static HTML",
    frameworkConfidence: 0,
    frameworkEvidence: [],
    needsBuild: false,
    strategy: "html-shell",
    entryHtmlPath: "index.html",
    entryHtmlNeedsCreate: false,
    configFilePath: null,
    strategyNote: null,
    hasPackageJson: false,
    existingManifestPath: "public/manifest.json",
    existingServiceWorkerPath: "public/service-worker.js",
    existingServiceWorker: {
      path: "public/service-worker.js",
      confidence: "high",
      sourceType: "likely-service-worker",
      registered: true,
      registrationTarget: null,
      candidates: [],
      registrations: [],
      diagnostics: [],
    },
    existingManifest: {
      path: "public/manifest.json",
      confidence: "high",
      linked: true,
      linkedFrom: null,
      candidates: [],
      diagnostics: [],
    },
    hasIcons: false,
    assetRoot: "public",
    suggestedStartUrl: "/",
    suggestedAppName: "Test App",
    suggestedDescription: "",
  };
}

test("html-shell PRESERVE: re-running on a project with its own manifest/SW+middleware still patches middleware.ts", async () => {
  const files = makeHtmlShellFiles();
  const analysis = makeHtmlShellAnalysis(files);
  const form = makeTestFormState(); // replaceManifest/replaceServiceWorker default false -> PRESERVE
  const iconImage = makeFakeIconImage() as unknown as HTMLImageElement;

  const result = await generatePwaPackage({ files, analysis, form, iconImage });

  const manifestEntry = result.mutationPlan.find((e) => e.path === "public/manifest.json");
  assert.equal(manifestEntry?.action, "PRESERVE");
  const swEntry = result.mutationPlan.find((e) => e.path === "public/service-worker.js");
  assert.equal(swEntry?.action, "PRESERVE");

  const middlewareEntry = findMiddlewareEntry(result);
  assert.ok(middlewareEntry, "PRESERVEd manifest/SW must still get middleware.ts allowlisted");
  assert.equal(middlewareEntry!.action, "UPDATE");
  assert.ok(result.updated.includes("middleware.ts"));
});

// ---------------------------------------------------------------------------
// next-app-router
// ---------------------------------------------------------------------------

function makeNextAppRouterFiles(): ClientFile[] {
  const layout = `export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
`;
  return [
    { path: "app/layout.tsx", ext: "tsx", bytes: enc.encode(layout) },
    { path: "public/manifest.webmanifest", ext: "webmanifest", bytes: enc.encode('{"name":"Existing"}') },
    { path: "public/service-worker.js", ext: "js", bytes: enc.encode("// existing sw") },
    makeMiddlewareFile(),
  ];
}

function makeNextAppRouterAnalysis(files: ClientFile[]): ProjectAnalysis {
  return {
    fileCount: files.length,
    totalBytes: files.reduce((s, f) => s + f.bytes.byteLength, 0),
    framework: "Next.js",
    frameworkConfidence: 1,
    frameworkEvidence: ["app/layout.tsx present"],
    needsBuild: true,
    strategy: "next-app-router",
    entryHtmlPath: null,
    entryHtmlNeedsCreate: false,
    configFilePath: "app/layout.tsx",
    strategyNote: null,
    hasPackageJson: false,
    existingManifestPath: "public/manifest.webmanifest",
    existingServiceWorkerPath: "public/service-worker.js",
    existingServiceWorker: {
      path: "public/service-worker.js",
      confidence: "high",
      sourceType: "likely-service-worker",
      registered: true,
      registrationTarget: null,
      candidates: [],
      registrations: [],
      diagnostics: [],
    },
    existingManifest: {
      path: "public/manifest.webmanifest",
      confidence: "high",
      linked: true,
      linkedFrom: null,
      candidates: [],
      diagnostics: [],
    },
    hasIcons: false,
    assetRoot: "public",
    suggestedStartUrl: "/",
    suggestedAppName: "Test App",
    suggestedDescription: "",
  };
}

test("next-app-router PRESERVE: re-running on a project with its own manifest/SW+middleware still patches middleware.ts", async () => {
  const files = makeNextAppRouterFiles();
  const analysis = makeNextAppRouterAnalysis(files);
  const form = makeTestFormState();
  const iconImage = makeFakeIconImage() as unknown as HTMLImageElement;

  const result = await generatePwaPackage({ files, analysis, form, iconImage });

  const manifestEntry = result.mutationPlan.find((e) => e.path === "public/manifest.webmanifest");
  assert.equal(manifestEntry?.action, "PRESERVE");
  const swEntry = result.mutationPlan.find((e) => e.path === "public/service-worker.js");
  assert.equal(swEntry?.action, "PRESERVE");

  const middlewareEntry = findMiddlewareEntry(result);
  assert.ok(middlewareEntry, "PRESERVEd manifest/SW must still get middleware.ts allowlisted");
  assert.equal(middlewareEntry!.action, "UPDATE");
  assert.ok(result.updated.includes("middleware.ts"));
});

// ---------------------------------------------------------------------------
// nuxt3
// ---------------------------------------------------------------------------

function makeNuxt3Files(): ClientFile[] {
  const cfg = `export default defineNuxtConfig({
  devtools: { enabled: true },
});
`;
  return [
    { path: "nuxt.config.ts", ext: "ts", bytes: enc.encode(cfg) },
    { path: "public/manifest.json", ext: "json", bytes: enc.encode('{"name":"Existing"}') },
    { path: "public/service-worker.js", ext: "js", bytes: enc.encode("// existing sw") },
    makeMiddlewareFile(),
  ];
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
    existingManifestPath: "public/manifest.json",
    existingServiceWorkerPath: "public/service-worker.js",
    existingServiceWorker: {
      path: "public/service-worker.js",
      confidence: "high",
      sourceType: "likely-service-worker",
      registered: true,
      registrationTarget: null,
      candidates: [],
      registrations: [],
      diagnostics: [],
    },
    existingManifest: {
      path: "public/manifest.json",
      confidence: "high",
      linked: true,
      linkedFrom: null,
      candidates: [],
      diagnostics: [],
    },
    hasIcons: false,
    assetRoot: "public",
    suggestedStartUrl: "/",
    suggestedAppName: "Test App",
    suggestedDescription: "",
  };
}

test("nuxt3 PRESERVE: re-running on a project with its own manifest/SW+middleware still patches middleware.ts", async () => {
  const files = makeNuxt3Files();
  const analysis = makeNuxt3Analysis(files);
  const form = makeTestFormState();
  const iconImage = makeFakeIconImage() as unknown as HTMLImageElement;

  const result = await generatePwaPackage({ files, analysis, form, iconImage });

  const manifestEntry = result.mutationPlan.find((e) => e.path === "public/manifest.json");
  assert.equal(manifestEntry?.action, "PRESERVE");
  const swEntry = result.mutationPlan.find((e) => e.path === "public/service-worker.js");
  assert.equal(swEntry?.action, "PRESERVE");

  const middlewareEntry = findMiddlewareEntry(result);
  assert.ok(middlewareEntry, "PRESERVEd manifest/SW must still get middleware.ts allowlisted");
  assert.equal(middlewareEntry!.action, "UPDATE");
  assert.ok(result.updated.includes("middleware.ts"));
});
