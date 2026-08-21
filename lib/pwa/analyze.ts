import type { ClientFile } from "@/lib/client-zip";
import type { ProjectAnalysis, PwaStrategy } from "./types";
import { detectServiceWorker, type ProjectTextFile } from "./detect/service-worker-detect";
import { detectManifest } from "./detect/manifest";
import { detectFramework } from "./detect/framework";

// NOTE: this used to mirror lib/framework-detect.ts's flat "first matching
// signature wins" list. That approach misclassified any Vite-based
// meta-framework (SvelteKit/Nuxt/Astro/Remix) that also ships a
// vite.config.* file as plain "Vite", since vite.config.* was checked
// before the meta-framework's own signature. Framework detection for the
// PWA engine now goes through detectFramework() (./detect/framework.ts),
// which weighs framework-specific evidence over generic Vite evidence
// regardless of file order. lib/framework-detect.ts (used for deploy/build
// tooling elsewhere in the app) is a separate, pre-existing module and is
// out of scope for this pass.

const ICON_HINT_RE = /icon|favicon|logo|apple-touch/i;
const HEAD_TAG_RE = /<head[\s>]/i;

// Extensions we're willing to treat as text for detection purposes (rule 22:
// never TextDecoder a binary file just because it happens to decode without
// throwing — images, fonts, and archives can "succeed" and produce garbage).
const TEXT_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "webmanifest",
  "html", "htm", "css", "vue", "svelte", "astro", "md", "mdx", "yml", "yaml", "txt",
]);

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Safe text decode for detection: only for known text extensions, never throws. */
function decodeIfText(f: ClientFile): string | null {
  if (!TEXT_EXTENSIONS.has(f.ext)) return null;
  try {
    return decodeUtf8(f.bytes);
  } catch {
    return null;
  }
}

function toProjectTextFiles(files: ClientFile[]): ProjectTextFile[] {
  return files.map((f) => ({ path: f.path, text: decodeIfText(f) }));
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

/** Exact-path lookup, trying each candidate in order. Returns the file (not just the path) so callers can inspect its content. */
function findExact(files: ClientFile[], candidates: string[]): ClientFile | null {
  for (const c of candidates) {
    const f = files.find((x) => x.path === c);
    if (f) return f;
  }
  return null;
}

function fileHasLiteralHead(f: ClientFile): boolean {
  return HEAD_TAG_RE.test(decodeUtf8(f.bytes));
}

interface StrategyResult {
  strategy: PwaStrategy;
  entryHtmlPath: string | null;
  entryHtmlNeedsCreate: boolean;
  configFilePath: string | null;
  strategyNote: string | null;
}

const UNSUPPORTED: Omit<StrategyResult, "strategyNote"> = {
  strategy: "unsupported",
  entryHtmlPath: null,
  entryHtmlNeedsCreate: false,
  configFilePath: null,
};

/**
 * Picks how Harbor PWA will wire itself into the project, based on the
 * detected framework's actual conventions rather than a blind search for
 * *.html — see the PwaStrategy doc comment in ./types for the full picture.
 */
function detectStrategy(files: ClientFile[], framework: string | null): StrategyResult {
  if (framework === "Next.js") {
    const appLayout = findExact(files, [
      "app/layout.tsx",
      "app/layout.jsx",
      "app/layout.js",
      "src/app/layout.tsx",
      "src/app/layout.jsx",
      "src/app/layout.js",
    ]);
    if (appLayout) {
      // Some App Router templates still render <head> literally — if so,
      // treat it exactly like any other html-shell instead of the special
      // file-convention path.
      if (fileHasLiteralHead(appLayout)) {
        return { strategy: "html-shell", entryHtmlPath: appLayout.path, entryHtmlNeedsCreate: false, configFilePath: null, strategyNote: null };
      }
      return { strategy: "next-app-router", entryHtmlPath: null, entryHtmlNeedsCreate: false, configFilePath: appLayout.path, strategyNote: null };
    }

    const doc = findExact(files, [
      "pages/_document.tsx",
      "pages/_document.jsx",
      "pages/_document.js",
      "src/pages/_document.tsx",
      "src/pages/_document.jsx",
      "src/pages/_document.js",
    ]);
    if (doc) {
      return { strategy: "html-shell", entryHtmlPath: doc.path, entryHtmlNeedsCreate: false, configFilePath: null, strategyNote: null };
    }

    // Pages Router without a custom _document.tsx — Harbor PWA creates a
    // minimal one, then injects into it like any other html-shell.
    const usesSrcPages = files.some((f) => f.path.startsWith("src/pages/"));
    const hasPagesDir = usesSrcPages || files.some((f) => f.path.startsWith("pages/"));
    if (hasPagesDir) {
      return {
        strategy: "html-shell",
        entryHtmlPath: usesSrcPages ? "src/pages/_document.tsx" : "pages/_document.tsx",
        entryHtmlNeedsCreate: true,
        configFilePath: null,
        strategyNote: null,
      };
    }

    return { ...UNSUPPORTED, strategyNote: "next_no_app_or_pages" };
  }

  if (framework === "Nuxt") {
    const cfg = findExact(files, ["nuxt.config.ts", "nuxt.config.js"]);
    if (cfg) return { strategy: "nuxt3", entryHtmlPath: null, entryHtmlNeedsCreate: false, configFilePath: cfg.path, strategyNote: null };
    return { ...UNSUPPORTED, strategyNote: "nuxt_no_config" };
  }

  if (framework === "Astro") {
    const layouts = files.filter((f) => f.ext === "astro" && fileHasLiteralHead(f));
    if (layouts.length > 0) {
      const named = layouts.find((f) => /layout/i.test(f.path));
      const chosen = named || layouts.sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
      return { strategy: "html-shell", entryHtmlPath: chosen.path, entryHtmlNeedsCreate: false, configFilePath: null, strategyNote: null };
    }
    return { ...UNSUPPORTED, strategyNote: "astro_no_head_layout" };
  }

  if (framework === "Gatsby") {
    const htmlJs = findExact(files, ["src/html.js", "src/html.tsx", "src/html.jsx"]);
    if (htmlJs && fileHasLiteralHead(htmlJs)) {
      return { strategy: "html-shell", entryHtmlPath: htmlJs.path, entryHtmlNeedsCreate: false, configFilePath: null, strategyNote: null };
    }
    return { ...UNSUPPORTED, strategyNote: "gatsby_no_html_js" };
  }

  if (framework === "Remix") {
    const root = findExact(files, ["app/root.tsx", "app/root.jsx", "app/root.js"]);
    if (root && fileHasLiteralHead(root)) {
      return { strategy: "html-shell", entryHtmlPath: root.path, entryHtmlNeedsCreate: false, configFilePath: null, strategyNote: null };
    }
    return { ...UNSUPPORTED, strategyNote: "remix_no_head_in_root" };
  }

  // Static HTML, Vite, CRA, Angular, SvelteKit, and anything unrecognized —
  // these all ship a genuine .html file with a literal <head> in source.
  const html = findEntryHtml(files);
  if (html) {
    return { strategy: "html-shell", entryHtmlPath: html, entryHtmlNeedsCreate: false, configFilePath: null, strategyNote: null };
  }
  return { ...UNSUPPORTED, strategyNote: "no_shell_found" };
}

export function analyzeProject(files: ClientFile[]): ProjectAnalysis {
  const totalBytes = files.reduce((sum, f) => sum + f.bytes.byteLength, 0);
  const pkgFile = files.find((f) => f.path === "package.json");
  const hasPackageJson = !!pkgFile;

  const frameworkDetection = detectFramework(files);
  let framework: string | null = frameworkDetection.framework;

  if (!framework) {
    framework = files.some((f) => f.ext === "html") ? "Static HTML" : hasPackageJson ? "Node.js" : null;
  }

  const needsBuild = !!framework && framework !== "Static HTML" && hasPackageJson;

  const strategyResult = detectStrategy(files, framework);
  const { strategy, entryHtmlPath, entryHtmlNeedsCreate, configFilePath, strategyNote } = strategyResult;

  const textFiles = toProjectTextFiles(files);
  const existingServiceWorker = detectServiceWorker(textFiles);
  const existingManifest = detectManifest(textFiles);
  // Only surface a plain path for confidently-detected artifacts — "low"
  // confidence candidates (unregistered guesses, docs/examples fixtures)
  // stay visible in the full detection object for diagnostics, but don't
  // get treated as "this project already has one" by the rest of the app.
  const existingManifestPath = existingManifest.confidence && existingManifest.confidence !== "low" ? existingManifest.path : null;
  const existingServiceWorkerPath = existingServiceWorker.path;
  const hasIcons = files.some((f) => ["png", "svg", "ico", "webp", "jpg", "jpeg"].includes(f.ext) && ICON_HINT_RE.test(f.path));

  const hasPublicDir = files.some((f) => f.path.startsWith("public/"));
  const hasStaticDir = files.some((f) => f.path.startsWith("static/"));
  const assetRoot = hasPublicDir ? "public" : hasStaticDir ? "static" : "";

  let suggestedStartUrl = "/";
  if (entryHtmlPath && !entryHtmlNeedsCreate) {
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
    frameworkConfidence: frameworkDetection.framework ? frameworkDetection.confidence : 0,
    frameworkEvidence: frameworkDetection.evidence,
    needsBuild,
    strategy,
    entryHtmlPath,
    entryHtmlNeedsCreate,
    configFilePath,
    strategyNote,
    hasPackageJson,
    existingManifestPath,
    existingServiceWorkerPath,
    existingServiceWorker,
    existingManifest,
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
