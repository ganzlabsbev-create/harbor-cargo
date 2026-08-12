import fs from "fs";
import path from "path";

export interface DetectionResult {
  framework: string;
  buildCommand: string | null;
  outputDir: string | null;
}

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

export function detectFramework(extractDir: string, packageJson: any | null): DetectionResult {
  for (const sig of CONFIG_SIGNATURES) {
    if (fs.existsSync(path.join(extractDir, sig.file))) {
      return {
        framework: sig.framework,
        buildCommand: packageJson?.scripts?.build ?? guessBuildCommand(sig.framework),
        outputDir: guessOutputDir(sig.framework),
      };
    }
  }

  const deps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };

  for (const sig of DEP_SIGNATURES) {
    if (deps[sig.dep]) {
      return {
        framework: sig.framework,
        buildCommand: packageJson?.scripts?.build ?? guessBuildCommand(sig.framework),
        outputDir: guessOutputDir(sig.framework),
      };
    }
  }

  if (fs.existsSync(path.join(extractDir, "index.html")) && !packageJson) {
    return { framework: "Static HTML", buildCommand: null, outputDir: "." };
  }

  if (packageJson) {
    return {
      framework: "Node.js (ไม่ทราบเฟรมเวิร์กชัดเจน)",
      buildCommand: packageJson?.scripts?.build ?? null,
      outputDir: null,
    };
  }

  return { framework: "ไม่สามารถระบุได้", buildCommand: null, outputDir: null };
}

function guessBuildCommand(framework: string): string {
  const map: Record<string, string> = {
    "Next.js": "next build",
    Vite: "vite build",
    Angular: "ng build",
    SvelteKit: "vite build",
    Nuxt: "nuxt build",
    Astro: "astro build",
    Gatsby: "gatsby build",
    Remix: "remix build",
    "Create React App": "react-scripts build",
  };
  return map[framework] ?? "npm run build";
}

function guessOutputDir(framework: string): string {
  const map: Record<string, string> = {
    "Next.js": ".next",
    Vite: "dist",
    Angular: "dist",
    SvelteKit: ".svelte-kit",
    Nuxt: ".output",
    Astro: "dist",
    Gatsby: "public",
    Remix: "build",
    "Create React App": "build",
  };
  return map[framework] ?? "dist";
}
