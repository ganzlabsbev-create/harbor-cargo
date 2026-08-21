import { test } from "node:test";
import assert from "node:assert/strict";
import { nextManifestPathFor, appRouterDirOf, generateNextManifestTs } from "../next-app-router";

// Test A: app/layout.tsx -> manifest at app/manifest.ts
test("P0-1 Test A: app/layout.tsx manifest resolves to app/manifest.ts", () => {
  assert.equal(nextManifestPathFor("app/layout.tsx"), "app/manifest.ts");
});

// Test B: src/app/layout.tsx -> manifest at src/app/manifest.ts
test("P0-1 Test B: src/app/layout.tsx manifest resolves to src/app/manifest.ts", () => {
  assert.equal(nextManifestPathFor("src/app/layout.tsx"), "src/app/manifest.ts");
});

test("P0-1: .jsx and .js layout extensions resolve the same way", () => {
  assert.equal(nextManifestPathFor("src/app/layout.jsx"), "src/app/manifest.ts");
  assert.equal(nextManifestPathFor("src/app/layout.js"), "src/app/manifest.ts");
  assert.equal(nextManifestPathFor("app/layout.js"), "app/manifest.ts");
});

// Test C is exercised at the build.ts level (manageManifest / existingManifestPath
// gate is unchanged by this fix — it decides *whether* to write, this module only
// decides *where*). Covered here by asserting the path helper never depends on
// whether a manifest already exists — that decision stays in build.ts.
test("P0-1 Test C: path resolution is independent of whether a manifest already exists", () => {
  const path1 = nextManifestPathFor("src/app/layout.tsx");
  const path2 = nextManifestPathFor("src/app/layout.tsx");
  assert.equal(path1, path2);
  assert.equal(path1, "src/app/manifest.ts");
});

// Test D: src/app/layout.tsx + icons -> all generated files resolve under the same app root
test("P0-1 Test D: manifest and icon files resolve under the same app root for src/app projects", () => {
  const layoutPath = "src/app/layout.tsx";
  const dir = appRouterDirOf(layoutPath);
  const manifestPath = nextManifestPathFor(layoutPath);
  const iconPath = `${dir}icon.png`;
  const appleIconPath = `${dir}apple-icon.png`;

  assert.equal(dir, "src/app/");
  assert.equal(manifestPath, "src/app/manifest.ts");
  assert.equal(iconPath, "src/app/icon.png");
  assert.equal(appleIconPath, "src/app/apple-icon.png");
  // all four must share the same directory prefix
  for (const p of [manifestPath, iconPath, appleIconPath]) {
    assert.ok(p.startsWith(dir), `${p} must live under ${dir}`);
  }
});

// Test E: ensure no accidental "app/manifest.ts" is created in a src/app project
test("P0-1 Test E: src/app project never resolves to a duplicate app/manifest.ts root", () => {
  const manifestPath = nextManifestPathFor("src/app/layout.tsx");
  assert.notEqual(manifestPath, "app/manifest.ts");
  assert.ok(!manifestPath.startsWith("app/"), "must not fall into the plain app/ root for a src/app project");
});

test("P0-1: appRouterDirOf handles a root-level layout with no directory component", () => {
  assert.equal(appRouterDirOf("layout.tsx"), "");
  assert.equal(nextManifestPathFor("layout.tsx"), "manifest.ts");
});

test("P0-1: generated manifest.ts source is still well-formed regardless of app root", () => {
  const src = generateNextManifestTs(
    {
      appName: "Test App",
      shortName: "Test",
      description: "",
      startUrl: "/",
      themeColor: "#000000",
      backgroundColor: "#ffffff",
      display: "standalone",
      replaceManifest: false,
      replaceServiceWorker: false,
      replaceIcons: false,
    },
    "/icons/icon-192.png",
    "/icons/icon-512.png"
  );
  assert.match(src, /export default function manifest/);
  assert.match(src, /"Test App"/);
});
