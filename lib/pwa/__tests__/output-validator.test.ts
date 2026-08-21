import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateFilesystem,
  validateMutationPlan,
  validateManifest,
  validateServiceWorker,
  validateHtml,
  validateOutput,
  resolveIconSrc,
  PwaValidationError,
} from "../validate";
import type { MutationPlanEntry } from "../types";
import type { ClientFile } from "@/lib/client-zip";

const enc = new TextEncoder();

function file(path: string, content = ""): ClientFile {
  const idx = path.lastIndexOf(".");
  const ext = idx > 0 ? path.slice(idx + 1).toLowerCase() : "";
  return { path, ext, bytes: enc.encode(content) };
}

function mapOf(files: ClientFile[]): Map<string, ClientFile> {
  return new Map(files.map((f) => [f.path, f]));
}

function plan(entries: [string, MutationPlanEntry["action"], string?][]): MutationPlanEntry[] {
  return entries.map(([path, action, reason]) => ({ path, action, reason: reason ?? "" }));
}

// ---------------------------------------------------------------------------
// resolveIconSrc
// ---------------------------------------------------------------------------

test("resolveIconSrc: relative src resolves against the manifest's own directory", () => {
  assert.equal(resolveIconSrc("public/manifest.json", "icons/icon-192.png", "public"), "public/icons/icon-192.png");
});

test("resolveIconSrc: root-relative src resolves against assetRoot", () => {
  assert.equal(resolveIconSrc("app/manifest.ts", "/icons/icon-192.png", "public"), "public/icons/icon-192.png");
});

test("resolveIconSrc: external/data URIs are not project-local and resolve to null", () => {
  assert.equal(resolveIconSrc("public/manifest.json", "https://cdn.example.com/icon.png", "public"), null);
  assert.equal(resolveIconSrc("public/manifest.json", "data:image/png;base64,abc", "public"), null);
});

test("resolveIconSrc: '..' segments walk up from the manifest directory", () => {
  assert.equal(resolveIconSrc("app/nested/manifest.json", "../icons/icon-192.png", "public"), "app/icons/icon-192.png");
});

// ---------------------------------------------------------------------------
// validateFilesystem (§2.1)
// ---------------------------------------------------------------------------

test("validateFilesystem: flags a planned CREATE/UPDATE whose target is missing from final output", () => {
  const original = mapOf([]);
  const final = mapOf([file("public/manifest.json", "{}")]);
  const issues = validateFilesystem(plan([["public/manifest.json", "CREATE"], ["public/service-worker.js", "CREATE"]]), original, final);
  assert.ok(issues.some((i) => i.code === "planned_write_missing" && i.path === "public/service-worker.js"));
});

test("validateFilesystem: flags case-collision between two final paths", () => {
  const final = mapOf([file("public/Manifest.json", "{}"), file("public/manifest.json", "{}")]);
  const issues = validateFilesystem([], mapOf([]), final);
  assert.ok(issues.some((i) => i.code === "case_collision"));
});

test("validateFilesystem: a normal, clean output produces no issues", () => {
  const final = mapOf([file("public/manifest.json", "{}"), file("index.html", "<html></html>")]);
  const issues = validateFilesystem(plan([["public/manifest.json", "CREATE"]]), mapOf([]), final);
  assert.equal(issues.length, 0);
});

// ---------------------------------------------------------------------------
// validateMutationPlan (§3)
// ---------------------------------------------------------------------------

test("mutation plan enforcement: PRESERVE violated when the file actually changed", () => {
  const original = mapOf([file("public/icons/icon-192.png", "orig-bytes")]);
  const final = mapOf([file("public/icons/icon-192.png", "different-bytes")]);
  const issues = validateMutationPlan(plan([["public/icons/icon-192.png", "PRESERVE"]]), original, final);
  assert.ok(issues.some((i) => i.code === "preserve_violated" && i.severity === "error"));
});

test("mutation plan enforcement: PRESERVE respected when the file is byte-identical", () => {
  const original = mapOf([file("public/icons/icon-192.png", "same-bytes")]);
  const final = mapOf([file("public/icons/icon-192.png", "same-bytes")]);
  const issues = validateMutationPlan(plan([["public/icons/icon-192.png", "PRESERVE"]]), original, final);
  assert.equal(issues.filter((i) => i.severity === "error").length, 0);
});

test("mutation plan enforcement: a file changed with no plan entry at all is an error", () => {
  const original = mapOf([file("index.html", "<html><head></head></html>")]);
  const final = mapOf([file("index.html", "<html><head><link rel=\"manifest\"></head></html>")]);
  const issues = validateMutationPlan([], original, final);
  assert.ok(issues.some((i) => i.code === "unplanned_update"));
});

test("mutation plan enforcement: a new file created with no plan entry at all is an error", () => {
  const original = mapOf([]);
  const final = mapOf([file("public/service-worker.js", "sw code")]);
  const issues = validateMutationPlan([], original, final);
  assert.ok(issues.some((i) => i.code === "unplanned_create"));
});

test("mutation plan enforcement: SKIP violated when the file was actually modified", () => {
  const original = mapOf([file("nuxt.config.ts", "export default {}")]);
  const final = mapOf([file("nuxt.config.ts", "export default { head: {} }")]);
  const issues = validateMutationPlan(plan([["nuxt.config.ts", "SKIP"]]), original, final);
  assert.ok(issues.some((i) => i.code === "skip_violated"));
});

test("mutation plan enforcement: planned CREATE that never materialized is an error", () => {
  const issues = validateMutationPlan(plan([["public/manifest.json", "CREATE"]]), mapOf([]), mapOf([]));
  assert.ok(issues.some((i) => i.code === "planned_create_missing"));
});

test("mutation plan enforcement: planned UPDATE with no actual change is a warning, not an error", () => {
  const original = mapOf([file("index.html", "same")]);
  const final = mapOf([file("index.html", "same")]);
  const issues = validateMutationPlan(plan([["index.html", "UPDATE"]]), original, final);
  assert.ok(issues.some((i) => i.code === "planned_update_no_change" && i.severity === "warning"));
  assert.equal(issues.filter((i) => i.severity === "error").length, 0);
});

test("mutation plan enforcement: a correctly planned CREATE + UPDATE combination is clean", () => {
  const original = mapOf([file("index.html", "<html><head></head></html>")]);
  const final = mapOf([
    file("index.html", "<html><head><link rel=\"manifest\" href=\"manifest.json\"></head></html>"),
    file("manifest.json", "{}"),
  ]);
  const issues = validateMutationPlan(
    plan([
      ["index.html", "UPDATE"],
      ["manifest.json", "CREATE"],
    ]),
    original,
    final
  );
  assert.equal(issues.length, 0);
});

// ---------------------------------------------------------------------------
// validateManifest (§2.2)
// ---------------------------------------------------------------------------

test("validateManifest: valid manifest with existing icon files passes clean", () => {
  const final = mapOf([
    file("public/manifest.json", JSON.stringify({ name: "App", icons: [{ src: "icons/icon-192.png", sizes: "192x192", type: "image/png" }] })),
    file("public/icons/icon-192.png", "binary"),
  ]);
  const issues = validateManifest("public/manifest.json", final, "public");
  assert.equal(issues.length, 0);
});

test("validateManifest: invalid JSON is a hard error", () => {
  const final = mapOf([file("public/manifest.json", "{not valid json")]);
  const issues = validateManifest("public/manifest.json", final, "public");
  assert.ok(issues.some((i) => i.code === "manifest_invalid_json"));
});

test("validateManifest: manifest that parses but isn't an object is a hard error", () => {
  const final = mapOf([file("public/manifest.json", "[1,2,3]")]);
  const issues = validateManifest("public/manifest.json", final, "public");
  assert.ok(issues.some((i) => i.code === "manifest_not_object"));
});

test("validateManifest: icon referencing a missing file is a hard error", () => {
  const final = mapOf([file("public/manifest.json", JSON.stringify({ name: "App", icons: [{ src: "icons/missing.png", sizes: "192x192" }] }))]);
  const issues = validateManifest("public/manifest.json", final, "public");
  assert.ok(issues.some((i) => i.code === "manifest_icon_missing_file"));
});

test("validateManifest: duplicate icon src entries produce a warning", () => {
  const final = mapOf([
    file(
      "public/manifest.json",
      JSON.stringify({
        name: "App",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192" },
          { src: "icons/icon-192.png", sizes: "192x192" },
        ],
      })
    ),
    file("public/icons/icon-192.png", "binary"),
  ]);
  const issues = validateManifest("public/manifest.json", final, "public");
  assert.ok(issues.some((i) => i.code === "manifest_icon_duplicate" && i.severity === "warning"));
});

test("validateManifest: icons field that isn't an array is a hard error", () => {
  const final = mapOf([file("public/manifest.json", JSON.stringify({ name: "App", icons: "nope" }))]);
  const issues = validateManifest("public/manifest.json", final, "public");
  assert.ok(issues.some((i) => i.code === "manifest_icons_not_array"));
});

test("validateManifest: Next.js file-convention manifest.ts is not JSON-parsed and passes through", () => {
  const final = mapOf([file("app/manifest.ts", "export default function manifest() { return {}; }")]);
  const issues = validateManifest("app/manifest.ts", final, "public");
  assert.equal(issues.length, 0);
});

test("validateManifest: null manifestPath (nothing to validate) is a no-op", () => {
  assert.equal(validateManifest(null, mapOf([]), "public").length, 0);
});

test("validateManifest: manifest file declared but missing from final output is a hard error", () => {
  const issues = validateManifest("public/manifest.json", mapOf([]), "public");
  assert.ok(issues.some((i) => i.code === "manifest_missing"));
});

// ---------------------------------------------------------------------------
// validateServiceWorker (§2.3)
// ---------------------------------------------------------------------------

test("validateServiceWorker: registration pointing at a real SW file is clean", () => {
  const final = mapOf([
    file("public/service-worker.js", `self.addEventListener("fetch", (e) => {});`),
    file("index.html", `<script>navigator.serviceWorker.register("/service-worker.js");</script>`),
  ]);
  const issues = validateServiceWorker(final);
  assert.equal(issues.filter((i) => i.severity === "error").length, 0);
});

test("validateServiceWorker: registration pointing at a missing SW file is a hard error", () => {
  const final = mapOf([file("index.html", `<script>navigator.serviceWorker.register("/service-worker.js");</script>`)]);
  const issues = validateServiceWorker(final);
  assert.ok(issues.some((i) => i.code === "sw_registration_target_missing"));
});

test("validateServiceWorker: dynamic registration target is not flagged as missing", () => {
  const final = mapOf([file("index.html", `<script>const p = getPath(); navigator.serviceWorker.register(p);</script>`)]);
  const issues = validateServiceWorker(final);
  assert.equal(issues.filter((i) => i.code === "sw_registration_target_missing").length, 0);
});

// ---------------------------------------------------------------------------
// validateHtml (§2.4)
// ---------------------------------------------------------------------------

test("validateHtml: single manifest link and single SW registration is clean", () => {
  const final = mapOf([
    file(
      "index.html",
      `<html><head><link rel="manifest" href="manifest.json"></head><body><script>navigator.serviceWorker.register("/sw.js");</script></body></html>`
    ),
  ]);
  assert.equal(validateHtml("index.html", final).length, 0);
});

test("validateHtml: duplicate manifest link tags is a hard error", () => {
  const final = mapOf([
    file(
      "index.html",
      `<html><head><link rel="manifest" href="a.json"><link rel="manifest" href="b.json"></head></html>`
    ),
  ]);
  const issues = validateHtml("index.html", final);
  assert.ok(issues.some((i) => i.code === "duplicate_manifest_link"));
});

test("validateHtml: duplicate SW registration calls is a hard error", () => {
  const final = mapOf([
    file(
      "index.html",
      `<script>navigator.serviceWorker.register("/sw.js");navigator.serviceWorker.register("/sw.js");</script>`
    ),
  ]);
  const issues = validateHtml("index.html", final);
  assert.ok(issues.some((i) => i.code === "duplicate_sw_registration"));
});

test("validateHtml: null entryHtmlPath (strategy with no head injection) is a no-op", () => {
  assert.equal(validateHtml(null, mapOf([])).length, 0);
});

// ---------------------------------------------------------------------------
// validateOutput (top-level) + PwaValidationError
// ---------------------------------------------------------------------------

test("validateOutput: a fully clean generation is valid with no errors", () => {
  const originalFiles = [file("index.html", "<html><head></head></html>")];
  const finalByPath = mapOf([
    file("index.html", `<html><head><link rel="manifest" href="manifest.json"></head></html>`),
    file("manifest.json", JSON.stringify({ name: "App", icons: [] })),
  ]);
  const result = validateOutput({
    plan: plan([
      ["index.html", "UPDATE"],
      ["manifest.json", "CREATE"],
    ]),
    originalFiles,
    finalByPath,
    manifestPath: "manifest.json",
    entryHtmlPath: "index.html",
    assetRoot: "",
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateOutput: an unauthorized mutation makes the whole result invalid", () => {
  const originalFiles = [file("config.js", "module.exports = {}")];
  const finalByPath = mapOf([file("config.js", "module.exports = { tampered: true }")]);
  const result = validateOutput({
    plan: [],
    originalFiles,
    finalByPath,
    manifestPath: null,
    entryHtmlPath: null,
    assetRoot: "",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "unplanned_update"));
});

test("PwaValidationError carries the failed ValidationResult and a descriptive message", () => {
  const result = validateOutput({
    plan: [],
    originalFiles: [],
    finalByPath: mapOf([file("x.js", "y")]),
    manifestPath: null,
    entryHtmlPath: null,
    assetRoot: "",
  });
  assert.equal(result.valid, false);
  const e = new PwaValidationError(result);
  assert.equal(e.name, "PwaValidationError");
  assert.equal(e.result, result);
  assert.match(e.message, /unplanned_create/);
});
