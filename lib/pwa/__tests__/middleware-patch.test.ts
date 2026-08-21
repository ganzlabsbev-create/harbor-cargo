import { test } from "node:test";
import assert from "node:assert/strict";
import { findMiddlewarePath, findPublicPathList } from "../detect/middleware-detect";
import { patchMiddlewarePublicPaths } from "../middleware-patch";

test("findMiddlewarePath: finds root middleware.ts", () => {
  const byPath = new Map([["middleware.ts", {}], ["app/page.tsx", {}]]);
  assert.equal(findMiddlewarePath(byPath), "middleware.ts");
});

test("findMiddlewarePath: finds src/middleware.ts when there's no root one", () => {
  const byPath = new Map([["src/middleware.ts", {}]]);
  assert.equal(findMiddlewarePath(byPath), "src/middleware.ts");
});

test("findMiddlewarePath: null when no middleware file exists", () => {
  const byPath = new Map([["app/page.tsx", {}]]);
  assert.equal(findMiddlewarePath(byPath), null);
});

test("findPublicPathList: matches Harbor Cargo's own PUBLIC_PATHS shape", () => {
  const code = `
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/version"];

export function middleware(req) {}
`;
  const list = findPublicPathList(code);
  assert.ok(list);
  assert.equal(list!.varName, "PUBLIC_PATHS");
  assert.deepEqual(list!.existingPaths, ["/login", "/api/auth", "/api/version"]);
  assert.equal(list!.quote, '"');
});

test("findPublicPathList: matches an unrelated name via the structural (all-paths) fallback", () => {
  const code = `
const openRoutes = ['/login', '/signup'];
`;
  const list = findPublicPathList(code);
  assert.ok(list);
  assert.equal(list!.varName, "openRoutes");
  assert.equal(list!.quote, "'");
});

test("findPublicPathList: ignores arrays that aren't path lists", () => {
  const code = `
const COLORS = ["red", "green", "blue"];
const PUBLIC_PATHS = ["/login"];
`;
  const list = findPublicPathList(code);
  assert.ok(list);
  assert.equal(list!.varName, "PUBLIC_PATHS");
});

test("findPublicPathList: returns null when no path-shaped array exists", () => {
  const code = `
export { default } from "next-auth/middleware";
export const config = { matcher: ["/((?!login).*)"] };
`;
  // matcher's array elements aren't "/"-prefixed path literals (they're a
  // regex string) other than coincidentally starting with "/" — this one
  // actually does start with "/", so assert on a case that truly has none.
  const code2 = `
export const config = { matcher: ["(?!login).*"] };
`;
  assert.equal(findPublicPathList(code2), null);
});

test("patchMiddlewarePublicPaths: appends missing paths, single-line array", () => {
  const code = `const PUBLIC_PATHS = ["/login", "/api/auth"];`;
  const result = patchMiddlewarePublicPaths(code, ["/manifest.webmanifest", "/service-worker.js"]);
  assert.equal(result.changed, true);
  assert.deepEqual(result.addedPaths, ["/manifest.webmanifest", "/service-worker.js"]);
  assert.equal(
    result.code,
    `const PUBLIC_PATHS = ["/login", "/api/auth", "/manifest.webmanifest", "/service-worker.js"];`
  );
});

test("patchMiddlewarePublicPaths: appends missing paths, multiline array, preserves indentation/quote style", () => {
  const code = `const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
];`;
  const result = patchMiddlewarePublicPaths(code, ["/manifest.webmanifest"]);
  assert.equal(result.changed, true);
  assert.ok(result.code.includes("  '/manifest.webmanifest',"));
  assert.ok(result.code.trim().endsWith("];"));
});

test("patchMiddlewarePublicPaths: idempotent — already-public paths are not duplicated", () => {
  const code = `const PUBLIC_PATHS = ["/login", "/manifest.webmanifest"];`;
  const result = patchMiddlewarePublicPaths(code, ["/manifest.webmanifest"]);
  assert.equal(result.changed, false);
  assert.equal(result.code, code);
  assert.deepEqual(result.addedPaths, []);
});

test("patchMiddlewarePublicPaths: only adds the still-missing path when one of two is already present", () => {
  const code = `const PUBLIC_PATHS = ["/login", "/manifest.webmanifest"];`;
  const result = patchMiddlewarePublicPaths(code, ["/manifest.webmanifest", "/service-worker.js"]);
  assert.equal(result.changed, true);
  assert.deepEqual(result.addedPaths, ["/service-worker.js"]);
});

test("patchMiddlewarePublicPaths: no allowlist found -> unchanged with a manual-step note", () => {
  const code = `export const config = { matcher: ["(?!login).*"] };`;
  const result = patchMiddlewarePublicPaths(code, ["/manifest.webmanifest"]);
  assert.equal(result.changed, false);
  assert.deepEqual(result.notes, ["middleware_no_public_path_list_found"]);
});

test("patchMiddlewarePublicPaths: generic — works on a differently-named/styled allowlist, not just Harbor Cargo's", () => {
  const code = `
import { NextResponse } from "next/server";

const WHITELIST = [
  "/signin",
  "/api/nextauth",
];

export function middleware(req) {
  if (WHITELIST.includes(req.nextUrl.pathname)) return NextResponse.next();
}
`;
  const result = patchMiddlewarePublicPaths(code, ["/manifest.webmanifest", "/service-worker.js"]);
  assert.equal(result.changed, true);
  assert.equal(result.varName, "WHITELIST");
  assert.ok(result.code.includes('"/manifest.webmanifest",'));
  assert.ok(result.code.includes('"/service-worker.js",'));
  // Original entries must survive untouched.
  assert.ok(result.code.includes('"/signin",'));
  assert.ok(result.code.includes('"/api/nextauth",'));
});
