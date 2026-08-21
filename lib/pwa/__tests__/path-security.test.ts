import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEntryPath } from "../detect/path-security";

test("normal relative paths pass through unchanged", () => {
  assert.equal(normalizeEntryPath("src/index.ts"), "src/index.ts");
  assert.equal(normalizeEntryPath("package.json"), "package.json");
});

test("rejects ../ traversal", () => {
  assert.equal(normalizeEntryPath("../../evil.js"), null);
  assert.equal(normalizeEntryPath("a/../../evil.js"), null);
  assert.equal(normalizeEntryPath("a/b/../../../evil.js"), null);
});

test("rejects backslash traversal (Windows-built zips)", () => {
  assert.equal(normalizeEntryPath("....\\evil.js"), null);
  assert.equal(normalizeEntryPath("a\\..\\..\\evil.js"), null);
});

test("rejects absolute paths", () => {
  assert.equal(normalizeEntryPath("/evil.js"), null);
  assert.equal(normalizeEntryPath("/etc/passwd"), null);
});

test("rejects Windows drive letters", () => {
  assert.equal(normalizeEntryPath("C:\\evil.js"), null);
  assert.equal(normalizeEntryPath("C:/evil.js"), null);
});

test("rejects null bytes", () => {
  assert.equal(normalizeEntryPath("a/b\0.js"), null);
});

test("collapses redundant ./ segments harmlessly", () => {
  assert.equal(normalizeEntryPath("./src/./index.ts"), "src/index.ts");
});

test("empty or root-only entries are rejected", () => {
  assert.equal(normalizeEntryPath(""), null);
  assert.equal(normalizeEntryPath("."), null);
});
