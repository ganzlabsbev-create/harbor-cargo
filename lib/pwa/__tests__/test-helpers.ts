import fs from "node:fs";
import path from "node:path";
import type { ProjectTextFile } from "../detect/service-worker-detect";

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
