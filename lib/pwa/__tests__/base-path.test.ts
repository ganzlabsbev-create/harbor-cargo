import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBasePath, resolvePublicPath } from "../detect/base-path";

test("normalizeBasePath: null/undefined/empty all mean root", () => {
  assert.equal(normalizeBasePath(null), "/");
  assert.equal(normalizeBasePath(undefined), "/");
  assert.equal(normalizeBasePath(""), "/");
});

test("normalizeBasePath: adds leading and trailing slash", () => {
  assert.equal(normalizeBasePath("myapp"), "/myapp/");
  assert.equal(normalizeBasePath("/myapp"), "/myapp/");
  assert.equal(normalizeBasePath("myapp/"), "/myapp/");
  assert.equal(normalizeBasePath("/myapp/"), "/myapp/");
});

test("normalizeBasePath: collapses duplicate slashes", () => {
  assert.equal(normalizeBasePath("//myapp//sub//"), "/myapp/sub/");
});

test("resolvePublicPath: root base, no leading slash on asset", () => {
  assert.equal(resolvePublicPath("/", "service-worker.js"), "/service-worker.js");
});

test("resolvePublicPath: root base, asset already has leading slash", () => {
  assert.equal(resolvePublicPath("/", "/icons/icon-192.png"), "/icons/icon-192.png");
});

test("resolvePublicPath: subpath base", () => {
  assert.equal(resolvePublicPath("/myapp/", "service-worker.js"), "/myapp/service-worker.js");
  assert.equal(resolvePublicPath("/myapp", "icons/icon-512.png"), "/myapp/icons/icon-512.png");
});

test("resolvePublicPath: subpath base with asset that has a leading slash", () => {
  assert.equal(resolvePublicPath("/myapp/", "/icons/icon-192.png"), "/myapp/icons/icon-192.png");
});

test("resolvePublicPath: null/undefined base defaults to root", () => {
  assert.equal(resolvePublicPath(null, "manifest.json"), "/manifest.json");
  assert.equal(resolvePublicPath(undefined, "manifest.json"), "/manifest.json");
});
