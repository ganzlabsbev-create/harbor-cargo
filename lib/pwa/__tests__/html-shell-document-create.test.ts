import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePwaPackage } from "../build";
import type { ProjectAnalysis, ClientFile } from "../types";
import { installFakeCanvasEnvironment, makeFakeIconImage, makeTestFormState } from "./test-helpers";

// Regression coverage for the entryHtmlNeedsCreate branch of runHtmlShell():
// a Next.js Pages Router project with no custom pages/_document.tsx, where
// Harbor PWA must synthesize one from scratch before it can inject PWA
// <head> tags into it. This is the trickiest of the three original bugs —
// unlike the other two (a plain missing recordPlan), this one *did* call
// recordPlan, but recorded the wrong action ("UPDATE" instead of "CREATE"),
// because by the time the plan was recorded, the file already existed in
// `byPath` (Harbor PWA had just put() the boilerplate there itself).

installFakeCanvasEnvironment();

const enc = new TextEncoder();

function makePagesRouterFiles(): ClientFile[] {
  const indexPage = `export default function Home() {
  return <div>Hello</div>;
}
`;
  return [{ path: "pages/index.tsx", ext: "tsx", bytes: enc.encode(indexPage) }];
}

function makeHtmlShellAnalysis(files: ClientFile[]): ProjectAnalysis {
  return {
    fileCount: files.length,
    totalBytes: files.reduce((s, f) => s + f.bytes.byteLength, 0),
    framework: "Next.js",
    frameworkConfidence: 1,
    frameworkEvidence: ["pages/ directory present"],
    needsBuild: true,
    strategy: "html-shell",
    entryHtmlPath: "pages/_document.tsx",
    entryHtmlNeedsCreate: true,
    configFilePath: null,
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

test("html-shell (Pages Router, no _document.tsx): generatePwaPackage() succeeds and plans the synthesized file as CREATE", async () => {
  const files = makePagesRouterFiles();
  const analysis = makeHtmlShellAnalysis(files);
  const form = makeTestFormState();
  const iconImage = makeFakeIconImage() as unknown as HTMLImageElement;

  const result = await generatePwaPackage({ files, analysis, form, iconImage });

  // Before the fix: this threw PwaValidationError("plan_mismatch") for
  // pages/_document.tsx — the plan said "UPDATE" but the file was actually
  // created (it did not exist in the original upload).
  assert.ok(result.zipBlob);

  const documentEntries = result.mutationPlan.filter((e) => e.path === "pages/_document.tsx");
  assert.equal(documentEntries.length, 1, "there must be exactly one plan entry for the synthesized file, not a duplicate");
  assert.equal(documentEntries[0].action, "CREATE", "a from-scratch pages/_document.tsx must be planned as CREATE, not UPDATE");

  assert.ok(result.added.includes("pages/_document.tsx"), "the file did not exist before, so it belongs in `added`");
  // NOTE: pages/_document.tsx also ends up in `updated` here — put() is
  // called twice for this path (once to synthesize the boilerplate, once to
  // inject the <head> tags), and put() decides added-vs-updated per call
  // based on byPath.has() *at that moment*, so the second call sees the
  // file it just wrote and logs it as an update too. This is a pre-existing
  // quirk in the added/updated bookkeeping (cosmetic only — it does not
  // affect `mutationPlan`, `validation`, or the final output content, which
  // this test already asserts above) and is outside the scope of the
  // recordPlan fix this test suite covers; not asserted on further here.
});

test("html-shell: an existing pages/_document.tsx (no synthesis needed) is still correctly planned as UPDATE", async () => {
  const existingDocument = `import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="custom" content="already here" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
`;
  const files: ClientFile[] = [
    ...makePagesRouterFiles(),
    { path: "pages/_document.tsx", ext: "tsx", bytes: enc.encode(existingDocument) },
  ];
  const analysis: ProjectAnalysis = { ...makeHtmlShellAnalysis(files), entryHtmlNeedsCreate: false };
  const form = makeTestFormState();
  const iconImage = makeFakeIconImage() as unknown as HTMLImageElement;

  const result = await generatePwaPackage({ files, analysis, form, iconImage });

  const documentEntries = result.mutationPlan.filter((e) => e.path === "pages/_document.tsx");
  assert.equal(documentEntries.length, 1);
  assert.equal(documentEntries[0].action, "UPDATE", "an already-existing document must still be planned as UPDATE, not CREATE");
  assert.ok(result.updated.includes("pages/_document.tsx"));
  assert.ok(!result.added.includes("pages/_document.tsx"));
});
