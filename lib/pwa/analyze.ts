import type { ClientFile } from "@/lib/client-zip";
import type { ProjectAnalysis } from "./types";

// Mirrors lib/framework-detect.ts, but works off an in-memory file list
// (ClientFile[]) instead of the filesystem, since Harbor PWA never uploads
// the project to Harbor's server — everything happens in the browser.
const CONFIG_SIGNATURES: Array<{ file: string; framework: string }> = [
  { file: "next.config.js", framework: "Next.js" },
  { file: "next.config.mjs", framework: "Next.js" },
  { file: "next.config.ts", framework: "Next.js" },
  { file: "vite.config.js", framework: "Vite" },
  { file: "vite.config.ts", framework: "Vite" },
  { file: "angular.json", framework: "Angular" },
  { file: "svelte.config.js", framework: "SvelteKit" },
  { file: "nuxt.config.js", framework: "Nuxt" },
  { file: "nuxt.config.ts", framework: "Nuxt" },
  { file: "astro.config.mjs", framework: "Astro" },
  { file: "gatsby-config.js", framework: "Gatsby" },
  { file: "remix.config.js", framework: "Remix" },
];

const DEP_SIGNATURES: Array<{ dep: string; framework: string }> = [
  { dep: "next", framework: "Next.js" },
  { dep: "vite", framework: "Vite" },
  { dep: "@angular/core", framework: "Angular" },
  { dep: "svelte", framework: "SvelteKit" },
  { dep: "nuxt", framework: "Nuxt" },
  { dep: "astro", framework: "Astro" },
  { dep: "gatsby", framework: "Gatsby" },
  { dep: "@remix-run/react", framework: "Remix" },
  { dep: "react-scripts", framework: "Create React App" },
];

const MANIFEST_NAMES = ["manifest.json", "manifest.webmanifest", "site.webmanifest"];
const SW_NAMES = ["service-worker.js", "sw.js", "serviceworker.js", "service-worker.ts"];
const ICON_HINT_RE = /icon|favicon|logo|apple-touch/i;

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Finds the best HTML entry point: root index.html first, then the shallowest index.html, then any HTML file. */
function findEntryHtml(files: ClientFile[]): string | null {
  const htmlFiles = files.filter((f) => f.ext === "html");
  if (htmlFiles.length === 0) return null;

  const rootIndex = htmlFiles.find((f) => f.path === "index.html");
  if (rootIndex) return rootIndex.path;

  const indexes = htmlFiles
    .filter((f) => f.path.toLowerCase().endsWith("index.html"))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  if (indexes.length > 0) return indexes[0].path;

  return htmlFiles.sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0].path;
}

function findByName(files: ClientFile[], names: string[]): string | null {
  for (const f of files) {
    const base = f.path.split("/").pop() || "";
    if (names.includes(base.toLowerCase())) return f.path;
  }
  return null;
}

export function analyzeProject(files: ClientFile[]): ProjectAnalysis {
  const totalBytes = files.reduce((sum, f) => sum + f.bytes.byteLength, 0);
  const pkgFile = files.find((f) => f.path === "package.json");
  const hasPackageJson = !!pkgFile;

  let framework: string | null = null;
  for (const sig of CONFIG_SIGNATURES) {
    if (files.some((f) => f.path === sig.file)) {
      framework = sig.framework;
      break;
    }
  }

  if (!framework && pkgFile) {
    try {
      const pkg = JSON.parse(decodeUtf8(pkgFile.bytes));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const sig of DEP_SIGNATURES) {
        if (deps[sig.dep]) {
          framework = sig.framework;
          break;
        }
      }
    } catch {
      // malformed package.json — fall through, still try to find an entry HTML
    }
  }

  if (!framework) {
    framework = files.some((f) => f.ext === "html") ? "Static HTML" : hasPackageJson ? "Node.js" : null;
  }

  const needsBuild = !!framework && framework !== "Static HTML" && hasPackageJson;

  const entryHtmlPath = findEntryHtml(files);
  const existingManifestPath = findByName(files, MANIFEST_NAMES);
  const existingServiceWorkerPath = findByName(files, SW_NAMES);
  const hasIcons = files.some((f) => ["png", "svg", "ico", "webp", "jpg", "jpeg"].includes(f.ext) && ICON_HINT_RE.test(f.path));

  const hasPublicDir = files.some((f) => f.path.startsWith("public/"));
  const hasStaticDir = files.some((f) => f.path.startsWith("static/"));
  const assetRoot = hasPublicDir ? "public" : hasStaticDir ? "static" : "";

  let suggestedStartUrl = "/";
  if (entryHtmlPath) {
    const dir = entryHtmlPath.includes("/") ? entryHtmlPath.slice(0, entryHtmlPath.lastIndexOf("/") + 1) : "";
    suggestedStartUrl = dir ? `/${dir}` : "/";
  }

  let suggestedAppName = "";
  let suggestedDescription = "";
  if (pkgFile) {
    try {
      const pkg = JSON.parse(decodeUtf8(pkgFile.bytes));
      if (typeof pkg.name === "string") {
        suggestedAppName = pkg.name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      if (typeof pkg.description === "string") suggestedDescription = pkg.description;
    } catch {
      // ignore, leave suggestions blank
    }
  }

  return {
    fileCount: files.length,
    totalBytes,
    framework,
    needsBuild,
    entryHtmlPath,
    hasPackageJson,
    existingManifestPath,
    existingServiceWorkerPath,
    hasIcons,
    assetRoot,
    suggestedStartUrl,
    suggestedAppName,
    suggestedDescription,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
