import fs from "node:fs";
import path from "node:path";
import type { ProjectTextFile } from "../detect/service-worker-detect";
import type { ClientFile } from "../types";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".DS_Store"]);
const TEXT_EXT = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "webmanifest",
  "html",
  "htm",
  "css",
  "vue",
  "svelte",
  "astro",
  "md",
  "mdx",
  "yml",
  "yaml",
  "txt",
]);

export function loadProjectTextFiles(rootDir: string): ProjectTextFile[] {
  const out: ProjectTextFile[] = [];

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else {
        const dot = entry.name.lastIndexOf(".");
        const ext = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : "";
        if (TEXT_EXT.has(ext)) {
          try {
            out.push({ path: rel, text: fs.readFileSync(abs, "utf-8") });
          } catch {
            out.push({ path: rel, text: null });
          }
        } else {
          out.push({ path: rel, text: null });
        }
      }
    }
  }

  walk(rootDir, "");
  return out;
}

/** Same walk as loadProjectTextFiles, but returns real ClientFile[] (with
 * bytes, as generatePwaPackage expects) instead of ProjectTextFile[] — for
 * full-pipeline tests that run generatePwaPackage() itself, not just a
 * detector. */
export function loadProjectClientFiles(rootDir: string): ClientFile[] {
  const out: ClientFile[] = [];

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else {
        const dot = entry.name.lastIndexOf(".");
        const ext = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : "";
        out.push({ path: rel, ext, bytes: new Uint8Array(fs.readFileSync(abs)) });
      }
    }
  }

  walk(rootDir, "");
  return out;
}

/**
 * generatePwaPackage() renders icons through the real browser canvas API
 * (document.createElement("canvas") + drawImage + toBlob — see
 * lib/pwa/icons.ts). That's unavailable under plain node:test, so this
 * installs the minimal stand-ins needed to exercise the full pipeline
 * end-to-end without pulling in a real DOM/canvas dependency. It only
 * touches `globalThis.document` when one isn't already present (e.g. if
 * tests ever run under a real jsdom-backed environment, this is a no-op and
 * the real implementation is used instead). Content of the rendered "PNG"
 * bytes is irrelevant to every test that uses this — only file presence and
 * the mutation plan are asserted.
 */
export function installFakeCanvasEnvironment(): void {
  const g = globalThis as unknown as { document?: unknown };
  if (g.document) return;

  const FAKE_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  class FakeContext2D {
    imageSmoothingEnabled = true;
    imageSmoothingQuality = "high";
    drawImage() {}
  }

  class FakeCanvas {
    width = 0;
    height = 0;
    getContext(kind: string) {
      return kind === "2d" ? new FakeContext2D() : null;
    }
    toBlob(cb: (blob: Blob | null) => void) {
      cb(new Blob([FAKE_PNG_BYTES], { type: "image/png" }));
    }
  }

  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag === "canvas") return new FakeCanvas();
      throw new Error(`installFakeCanvasEnvironment: unsupported element "${tag}"`);
    },
  };
}

/** A minimal stand-in for an already-loaded HTMLImageElement, good enough
 * for renderIconPng() (it only reads naturalWidth/width/naturalHeight/height
 * off the object — see lib/pwa/icons.ts). */
export function makeFakeIconImage(size = 512): { naturalWidth: number; naturalHeight: number; width: number; height: number } {
  return { naturalWidth: size, naturalHeight: size, width: size, height: size };
}

/** A complete, sensible default PwaFormState for tests that don't care about
 * specific field values — only about which strategy branch runs. */
export function makeTestFormState(overrides: Partial<import("../types").PwaFormState> = {}): import("../types").PwaFormState {
  return {
    appName: "Test App",
    shortName: "Test",
    description: "A test app",
    startUrl: "/",
    themeColor: "#111111",
    backgroundColor: "#ffffff",
    display: "standalone",
    replaceManifest: false,
    replaceServiceWorker: false,
    replaceIcons: false,
    ...overrides,
  };
}
