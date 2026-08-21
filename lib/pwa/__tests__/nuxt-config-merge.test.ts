import { test } from "node:test";
import assert from "node:assert/strict";
import { patchNuxtConfigHead } from "../nuxt";
import type { PwaFormState } from "../types";

const form: PwaFormState = {
  appName: "Test App",
  shortName: "Test",
  description: "",
  startUrl: "/",
  themeColor: "#112233",
  backgroundColor: "#ffffff",
  display: "standalone",
  replaceManifest: false,
  replaceServiceWorker: false,
  replaceIcons: false,
};

const MANIFEST_HREF = "/manifest.webmanifest";
const APPLE_HREF = "/apple-icon.png";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// Must still be valid enough to sanity-check brace balance after patching —
// a cheap proxy for "didn't mangle the file".
function bracesBalanced(code: string): boolean {
  let depth = 0;
  for (const ch of code) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

// 1. No app config -> create app safely
test("Nuxt merge 1: no existing app config creates one safely", () => {
  const code = `export default defineNuxtConfig({\n  ssr: true,\n})\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(result.changed);
  assert.equal(countOccurrences(result.code, "app:"), 1);
  assert.ok(result.code.includes('rel: "manifest"'));
  assert.ok(bracesBalanced(result.code));
});

// 2. Existing app config -> merge
test("Nuxt merge 2: existing app config with unrelated content merges head in, no duplicate app key", () => {
  const code = `export default defineNuxtConfig({\n  app: {\n    foo: "bar",\n  },\n  ssr: true,\n})\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(result.changed);
  assert.equal(countOccurrences(result.code, "app:"), 1, "must not create a second app: key");
  assert.ok(result.code.includes('foo: "bar"'), "must preserve unrelated app property");
  assert.ok(result.code.includes('rel: "manifest"'));
  assert.ok(bracesBalanced(result.code));
});

// 3. Existing app.head -> merge head
test("Nuxt merge 3: existing app.head merges meta/link into it without duplicating head key", () => {
  const code = `export default defineNuxtConfig({\n  app: {\n    head: {\n      title: "Existing",\n    },\n  },\n})\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(result.changed);
  assert.equal(countOccurrences(result.code, "head:"), 1, "must not create a second head: key");
  assert.ok(result.code.includes('title: "Existing"'), "must preserve existing title");
  assert.ok(result.code.includes('rel: "manifest"'));
  assert.ok(bracesBalanced(result.code));
});

// 4. Existing unrelated app properties -> preserve
test("Nuxt merge 4: unrelated top-level app properties survive the merge", () => {
  const code = `export default defineNuxtConfig({\n  app: {\n    pageTransition: { name: "fade" },\n    head: {\n      meta: [{ name: "description", content: "hi" }],\n    },\n  },\n})\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(result.changed);
  assert.ok(result.code.includes('pageTransition: { name: "fade" }'));
  assert.ok(result.code.includes('name: "description"'), "existing meta entries must be preserved");
  assert.ok(result.code.includes("theme-color"), "new meta entry must be appended");
  assert.ok(bracesBalanced(result.code));
});

// 5. Existing PWA config -> no duplicate (idempotency via marker)
test("Nuxt merge 5: re-running on an already-patched file is a no-op", () => {
  const code = `export default defineNuxtConfig({\n  ssr: true,\n})\n`;
  const first = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(first.changed);
  const second = patchNuxtConfigHead(first.code, form, MANIFEST_HREF, APPLE_HREF);
  assert.equal(second.changed, false);
  assert.equal(second.code, first.code);
  assert.equal(countOccurrences(second.code, "app:"), 1);
});

test("Nuxt merge 5b: manually-authored equivalent theme-color/manifest link is not duplicated", () => {
  const code = `export default defineNuxtConfig({\n  app: {\n    head: {\n      meta: [{ name: "theme-color", content: "#000000" }],\n      link: [{ rel: "manifest", href: "/site.webmanifest" }],\n    },\n  },\n})\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  // Neither theme-color nor manifest link should be duplicated, but the
  // apple-touch-icon link (not present) should still be added.
  assert.equal(countOccurrences(result.code, "theme-color"), 1);
  assert.equal(countOccurrences(result.code, 'rel: "manifest"'), 1);
  if (result.changed) {
    assert.ok(result.code.includes("apple-touch-icon"));
  }
  assert.ok(bracesBalanced(result.code));
});

// 6. Existing config with unusual formatting -> either safely patch or skip with warning
test("Nuxt merge 6: unusual formatting (single quotes, extra whitespace) either patches safely or warns", () => {
  const code = `export default defineNuxtConfig({\n\n\n  app:   {\n    head:{\n       'title' : 'Existing'\n    }\n  }\n\n})`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(bracesBalanced(result.code));
  if (result.changed) {
    assert.equal(countOccurrences(result.code, "app:") + countOccurrences(result.code, "'app'"), 1);
  } else {
    assert.ok(result.notes.length > 0, "must explain why it didn't patch");
  }
});

// 7. Malformed/unsupported config -> unchanged + warning
test("Nuxt merge 7: unrecognized config shape leaves file unchanged with a warning note", () => {
  const code = `export default someWrapperFunction(nuxtConfigFactory())\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.equal(result.changed, false);
  assert.equal(result.code, code, "original file must be byte-for-byte preserved");
  assert.ok(result.notes.includes("nuxt_config_shape_not_recognized"));
});

test("Nuxt merge: app value that isn't an object literal is refused, not guessed at", () => {
  const code = `const shared = { head: {} };\nexport default defineNuxtConfig({\n  app: shared,\n})\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.equal(result.changed, false);
  assert.equal(result.code, code);
  assert.ok(result.notes.includes("nuxt_config_app_not_object"));
});

test("Nuxt merge: a brace-containing string value in app doesn't confuse the scanner", () => {
  const code = `export default defineNuxtConfig({\n  app: {\n    baseURL: "/app/{env}/",\n    head: {\n      title: "My { App }",\n    },\n  },\n})\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(result.changed);
  assert.ok(result.code.includes('baseURL: "/app/{env}/"'), "string content with braces must be preserved verbatim");
  assert.ok(result.code.includes('title: "My { App }"'));
  assert.equal(countOccurrences(result.code, "head:"), 1);
  assert.ok(bracesBalanced(result.code));
});

test("Nuxt merge: export default { ... } (no defineNuxtConfig wrapper) with existing app.head merges", () => {
  const code = `export default {\n  app: {\n    head: {\n      title: "Plain",\n    },\n  },\n}\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(result.changed);
  assert.ok(result.code.includes('title: "Plain"'));
  assert.equal(countOccurrences(result.code, "head:"), 1);
});

test("Nuxt merge: empty existing meta/link arrays are filled in without a stray leading comma", () => {
  const code = `export default defineNuxtConfig({\n  app: {\n    head: {\n      meta: [],\n      link: [],\n    },\n  },\n})\n`;
  const result = patchNuxtConfigHead(code, form, MANIFEST_HREF, APPLE_HREF);
  assert.ok(result.changed);
  assert.ok(!/\[\s*,/.test(result.code), "must not leave a leading comma in a previously-empty array");
  assert.ok(result.code.includes("theme-color"));
  assert.ok(bracesBalanced(result.code));
});
