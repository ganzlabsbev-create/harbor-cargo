import { test } from "node:test";
import assert from "node:assert/strict";
import { detectServiceWorker, type ProjectTextFile } from "../detect/service-worker-detect";

const REAL_SW = `
const CACHE_NAME = "app-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  clients.claim();
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
`;

const GENERATOR_SOURCE = `
export function generateServiceWorkerSource(version) {
  return \`
    const CACHE_NAME = "harbor-pwa-\${version}";
    self.addEventListener("install", (event) => { self.skipWaiting(); });
    self.addEventListener("fetch", (event) => {
      event.respondWith(caches.match(event.request).then((c) => c || fetch(event.request)));
    });
  \`;
}
`;

test("real service worker at public/service-worker.js is detected as likely-service-worker and active when registered", () => {
  const files: ProjectTextFile[] = [
    { path: "public/service-worker.js", text: REAL_SW },
    { path: "index.html", text: `<script>navigator.serviceWorker.register("/service-worker.js");</script>` },
  ];
  const result = detectServiceWorker(files);
  assert.equal(result.path, "public/service-worker.js");
  assert.equal(result.sourceType, "likely-service-worker");
  assert.equal(result.registered, true);
});

test("generator source that only builds SW code inside a template literal is NOT detected as an active SW", () => {
  const files: ProjectTextFile[] = [{ path: "lib/pwa/service-worker.ts", text: GENERATOR_SOURCE }];
  const result = detectServiceWorker(files);
  assert.equal(result.path, null, "no active SW should be detected — only a generator exists");
  assert.equal(result.registered, false);
  const candidate = result.candidates.find((c) => c.path === "lib/pwa/service-worker.ts");
  assert.ok(candidate, "candidate should still be reported for diagnostics");
  assert.equal(candidate!.sourceType, "generator-source");
});

test("adversarial fixtures: docs/examples/tests sw.js files are not treated as authoritative", () => {
  const files: ProjectTextFile[] = [
    { path: "docs/sw.js", text: REAL_SW },
    { path: "examples/sw.js", text: REAL_SW },
    { path: "test/sw.js", text: REAL_SW },
  ];
  const result = detectServiceWorker(files);
  assert.equal(result.path, null, "no doc/example/test SW should be promoted to active without registration");
  for (const c of result.candidates) {
    assert.notEqual(c.confidence, "high");
  }
});

test("SW file exists but no registration found -> not treated as active (case D)", () => {
  const files: ProjectTextFile[] = [{ path: "public/sw.js", text: REAL_SW }];
  const result = detectServiceWorker(files);
  assert.equal(result.path, "public/sw.js", "candidate should still be surfaced");
  assert.equal(result.registered, false);
});

test("registration exists but target file missing -> reported as broken, not crashing (case B)", () => {
  const files: ProjectTextFile[] = [{ path: "index.html", text: `<script>navigator.serviceWorker.register("/missing-sw.js");</script>` }];
  const result = detectServiceWorker(files);
  assert.equal(result.path, null);
  assert.ok(result.diagnostics.some((d) => d.includes("no matching Service Worker file")));
});

test("registration pointing at a custom-named SW is respected (case C) — not forced to /service-worker.js", () => {
  const files: ProjectTextFile[] = [
    { path: "public/my-custom-sw.js", text: REAL_SW },
    { path: "src/main.js", text: `navigator.serviceWorker.register("/my-custom-sw.js");` },
  ];
  const result = detectServiceWorker(files);
  assert.equal(result.path, "public/my-custom-sw.js");
  assert.equal(result.registered, true);
});

test("registration call that only exists inside a generated template string is ignored", () => {
  const files: ProjectTextFile[] = [
    { path: "public/service-worker.js", text: REAL_SW },
    {
      path: "lib/pwa/service-worker.ts",
      text: `export function snippet(p) { return \`navigator.serviceWorker.register("\${p}")\`; }`,
    },
  ];
  const result = detectServiceWorker(files);
  // The generated snippet must not count as a real registration for the real SW.
  assert.equal(result.registered, false);
});
