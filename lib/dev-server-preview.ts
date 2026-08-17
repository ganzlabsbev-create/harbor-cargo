"use client";

// Phase 2 of Harbor Preview: real dev-server preview for Node/framework
// projects (Next.js, Vite, CRA, SvelteKit, Nuxt, Astro, Gatsby, Remix, ...)
// via @webcontainer/api — a real Node runtime that boots inside the
// browser tab. Nothing is sent to Harbor's server to be executed; the
// install and dev server both run client-side, same trust model as
// lib/static-preview.ts (Phase 1).
//
// Requires the page to be cross-origin isolated (see the headers() block
// in next.config.mjs for /tools/preview) and a browser that supports
// SharedArrayBuffer. iOS Safari in particular is inconsistent here — always
// check isDevServerSupported() and fall back to buildStaticPreview() when
// it's false, rather than surfacing a hard error.

import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import type { ClientFile } from "./client-zip";

export type LogLevel = "install" | "dev" | "info" | "error";
export interface DevLogLine {
  level: LogLevel;
  text: string;
  ts: number;
}

export interface DevServerHandle {
  url: string;
  framework: string;
  /** Stops the dev process and tears down the WebContainer boot. */
  teardown: () => Promise<void>;
}

// --- capability check --------------------------------------------------

export function isDevServerSupported(): boolean {
  if (typeof window === "undefined") return false;
  // crossOriginIsolated is only true when COOP/COEP are both in effect,
  // which is what unlocks SharedArrayBuffer (what WebContainers run on).
  return window.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined";
}

// --- lightweight client-side framework detection ------------------------
// Deliberately duplicates the shape of lib/framework-detect.ts rather than
// importing it: that file uses Node's `fs`/`path` against an on-disk
// extraction and can only run server-side. This version works directly
// against the already-in-memory ClientFile[] the browser extracted.

interface DevDetection {
  framework: string;
  devCommand: string[];
  /** Roughly how long a fresh `npm install` for this kind of project tends to take — used only for the progress label, not a hard timeout. */
  installHint: string;
}

const CONFIG_SIGNATURES: Array<{ file: string; framework: string; devCommand: string[] }> = [
  { file: "next.config.js", framework: "Next.js", devCommand: ["npx", "next", "dev"] },
  { file: "next.config.mjs", framework: "Next.js", devCommand: ["npx", "next", "dev"] },
  { file: "next.config.ts", framework: "Next.js", devCommand: ["npx", "next", "dev"] },
  { file: "vite.config.js", framework: "Vite", devCommand: ["npx", "vite", "--host"] },
  { file: "vite.config.ts", framework: "Vite", devCommand: ["npx", "vite", "--host"] },
  { file: "svelte.config.js", framework: "SvelteKit", devCommand: ["npx", "vite", "--host"] },
  { file: "nuxt.config.js", framework: "Nuxt", devCommand: ["npx", "nuxt", "dev"] },
  { file: "nuxt.config.ts", framework: "Nuxt", devCommand: ["npx", "nuxt", "dev"] },
  { file: "astro.config.mjs", framework: "Astro", devCommand: ["npx", "astro", "dev", "--host"] },
  { file: "gatsby-config.js", framework: "Gatsby", devCommand: ["npx", "gatsby", "develop", "-H", "0.0.0.0"] },
  { file: "remix.config.js", framework: "Remix", devCommand: ["npx", "remix", "dev"] },
];

const DEP_SIGNATURES: Array<{ dep: string; framework: string; devCommand: string[] }> = [
  { dep: "next", framework: "Next.js", devCommand: ["npx", "next", "dev"] },
  { dep: "vite", framework: "Vite", devCommand: ["npx", "vite", "--host"] },
  { dep: "svelte", framework: "SvelteKit", devCommand: ["npx", "vite", "--host"] },
  { dep: "nuxt", framework: "Nuxt", devCommand: ["npx", "nuxt", "dev"] },
  { dep: "astro", framework: "Astro", devCommand: ["npx", "astro", "dev", "--host"] },
  { dep: "gatsby", framework: "Gatsby", devCommand: ["npx", "gatsby", "develop", "-H", "0.0.0.0"] },
  { dep: "@remix-run/react", framework: "Remix", devCommand: ["npx", "remix", "dev"] },
  { dep: "react-scripts", framework: "Create React App", devCommand: ["npx", "react-scripts", "start"] },
];

// Angular intentionally excluded: `ng serve` typically needs more memory
// than a mobile-browser WebContainer reliably gets. It falls through to
// the generic `npm run dev` guess below instead of a confident match.

function detectDevCommand(files: ClientFile[], pkg: any): DevDetection | null {
  const paths = new Set(files.map((f) => f.path));
  for (const sig of CONFIG_SIGNATURES) {
    if (paths.has(sig.file)) {
      return { framework: sig.framework, devCommand: sig.devCommand, installHint: "~30–90s" };
    }
  }

  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  for (const sig of DEP_SIGNATURES) {
    if (deps[sig.dep]) {
      return { framework: sig.framework, devCommand: sig.devCommand, installHint: "~30–90s" };
    }
  }

  if (pkg?.scripts?.dev) {
    return { framework: "Node.js", devCommand: ["npm", "run", "dev"], installHint: "~30–90s" };
  }
  if (pkg?.scripts?.start) {
    return { framework: "Node.js", devCommand: ["npm", "run", "start"], installHint: "~30–90s" };
  }

  return null;
}

// --- FileSystemTree building --------------------------------------------

function toFileSystemTree(files: ClientFile[]): any {
  const decoder = new TextDecoder();
  const root: any = {};

  for (const f of files) {
    const segments = f.path.split("/").filter(Boolean);
    let cursor = root;
    segments.forEach((seg, idx) => {
      const isLast = idx === segments.length - 1;
      if (isLast) {
        // WebContainers accept either text or raw bytes; text is enough
        // for every file type we mount (source + config + json/lockfiles).
        // Binary assets still work fine as UTF-8-decoded text on the
        // in-container filesystem — only matters if a build step re-reads
        // them as binary, which none of the supported dev servers do for
        // typical static assets served straight from /public.
        let contents: string;
        try {
          contents = decoder.decode(f.bytes);
        } catch {
          contents = "";
        }
        cursor[seg] = { file: { contents } };
      } else {
        cursor[seg] = cursor[seg] || { directory: {} };
        cursor = cursor[seg].directory;
      }
    });
  }

  return root;
}

// --- singleton boot -------------------------------------------------------
// WebContainer only allows one instance booted per browser tab. We keep it
// alive across re-runs (re-analyzing a new upload just re-mounts + kills
// the previous dev process) instead of tearing it fully down each time,
// since boot() itself is the slowest step.

let containerPromise: Promise<WebContainer> | null = null;
let activeDevProcess: WebContainerProcess | null = null;

async function getContainer(): Promise<WebContainer> {
  if (!containerPromise) {
    containerPromise = import("@webcontainer/api").then((mod) => mod.WebContainer.boot());
  }
  return containerPromise;
}

async function stopActiveDevProcess() {
  if (activeDevProcess) {
    try {
      activeDevProcess.kill();
    } catch {
      // already dead — fine
    }
    activeDevProcess = null;
  }
}

// --- main entry point -----------------------------------------------------

/**
 * Boots (or reuses) a WebContainer, mounts the project, installs deps, and
 * starts the detected dev server. Returns null (not a rejected promise) when
 * this project has no package.json / no recognizable dev command — that's
 * the caller's signal to fall back to lib/static-preview.ts instead of
 * showing an error.
 */
export async function runDevServerPreview(
  files: ClientFile[],
  onLog: (line: DevLogLine) => void
): Promise<DevServerHandle | null> {
  const pkgFile = files.find((f) => f.path === "package.json");
  if (!pkgFile) return null;

  let pkg: any = null;
  try {
    pkg = JSON.parse(new TextDecoder().decode(pkgFile.bytes));
  } catch {
    onLog({ level: "error", text: "package.json มีอยู่แต่อ่านไม่ได้ (invalid JSON) — ข้ามไปใช้ static preview แทน", ts: Date.now() });
    return null;
  }

  const detection = detectDevCommand(files, pkg);
  if (!detection) return null;

  await stopActiveDevProcess();

  onLog({ level: "info", text: `ตรวจพบ ${detection.framework} — กำลังเตรียม dev server (โดยประมาณ ${detection.installHint})`, ts: Date.now() });

  const container = await getContainer();

  const tree = toFileSystemTree(files);
  await container.mount(tree);

  const install = await container.spawn("npm", ["install"]);
  install.output.pipeTo(
    new WritableStream({
      write(chunk) {
        onLog({ level: "install", text: String(chunk), ts: Date.now() });
      },
    })
  );
  const installExit = await install.exit;
  if (installExit !== 0) {
    throw new Error(`npm install ล้มเหลว (exit code ${installExit})`);
  }

  onLog({ level: "info", text: `กำลังรัน: ${detection.devCommand.join(" ")}`, ts: Date.now() });

  const [cmd, ...args] = detection.devCommand;
  const devProcess = await container.spawn(cmd, args);
  activeDevProcess = devProcess;
  devProcess.output.pipeTo(
    new WritableStream({
      write(chunk) {
        onLog({ level: "dev", text: String(chunk), ts: Date.now() });
      },
    })
  );

  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("dev server ไม่ตอบสนองภายใน 2 นาที")), 120_000);
    container.on("server-ready", (_port, serverUrl) => {
      clearTimeout(timeout);
      resolve(serverUrl);
    });
  });

  return {
    url,
    framework: detection.framework,
    teardown: async () => {
      await stopActiveDevProcess();
    },
  };
}

/** Call on unmount to stop the dev server without discarding the boot itself (so switching back is fast). */
export async function stopDevServerPreview() {
  await stopActiveDevProcess();
}
