import type { ClientFile } from "@/lib/client-zip";

/**
 * Evidence-based framework detection.
 *
 * The old detector walked a flat CONFIG_SIGNATURES list and stopped at the
 * first matching file, in a fixed array order. Because vite.config.* was
 * listed early, any project meta-framework built on Vite (SvelteKit, Nuxt,
 * Astro, Remix) that also ships a vite.config.* file — which is extremely
 * common — was misclassified as plain "Vite" before its own, more specific
 * signature was ever checked.
 *
 * This detector instead collects *evidence* for every candidate framework
 * first, then picks a winner by specificity: a meta-framework's own
 * dependency/config/marker-file evidence always outranks generic Vite
 * evidence, no matter what order files happen to appear in the zip. Vite
 * itself only wins when no stronger framework evidence exists at all.
 */

export interface FrameworkDetectionResult {
  /** Display name, e.g. "SvelteKit", "Vite", "Next.js". Null if nothing matched. */
  framework: string | null;
  /** 0–1. Deliberately coarse (few discrete levels) rather than a finely
   * tuned score — the exact number matters less than "is this ambiguous". */
  confidence: number;
  /** Human-readable evidence strings, e.g. `dependency "@sveltejs/kit"`. */
  evidence: string[];
  /** Version string from package.json, if the winning dependency was found there. */
  version: string | null;
}

interface FrameworkRule {
  framework: string;
  /** Dependency names (in package.json dependencies/devDependencies) that
   * are specific to this framework — never shared with a generic bundler. */
  deps: string[];
  /** Config/marker file paths, checked by exact match against the file list. */
  files: string[];
}

// Order matters only as a tie-breaker when a project genuinely presents
// strong evidence for more than one meta-framework at once (rare, and
// itself worth a low-confidence/ambiguous result — see resolveAmbiguous
// below). It is NOT used as "first match wins" the way the old detector
// was. Vite is deliberately last and handled separately: it only wins when
// no rule above it produced any evidence.
const FRAMEWORK_RULES: FrameworkRule[] = [
  { framework: "SvelteKit", deps: ["@sveltejs/kit"], files: ["svelte.config.js", "svelte.config.ts", "src/app.html"] },
  { framework: "Nuxt", deps: ["nuxt"], files: ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs"] },
  { framework: "Remix", deps: ["@remix-run/react", "@remix-run/node", "@remix-run/serve"], files: ["remix.config.js", "remix.config.ts"] },
  { framework: "Astro", deps: ["astro"], files: ["astro.config.mjs", "astro.config.ts", "astro.config.js"] },
  { framework: "Angular", deps: ["@angular/core"], files: ["angular.json"] },
  { framework: "Next.js", deps: ["next"], files: ["next.config.js", "next.config.mjs", "next.config.ts"] },
  { framework: "Gatsby", deps: ["gatsby"], files: ["gatsby-config.js", "gatsby-config.ts"] },
  { framework: "Create React App", deps: ["react-scripts"], files: [] },
];

const VITE_DEPS = ["vite"];
const VITE_FILES = ["vite.config.js", "vite.config.ts", "vite.config.mjs", "vite.config.cts", "vite.config.mts"];

interface Candidate {
  framework: string;
  evidence: string[];
  version: string | null;
}

function collectEvidence(rule: FrameworkRule, filePaths: Set<string>, deps: Record<string, string>): Candidate | null {
  const evidence: string[] = [];
  let version: string | null = null;

  for (const dep of rule.deps) {
    if (deps[dep]) {
      evidence.push(`package dependency "${dep}"`);
      if (!version) version = deps[dep];
    }
  }
  for (const file of rule.files) {
    if (filePaths.has(file)) {
      evidence.push(`"${file}" exists`);
    }
  }

  if (evidence.length === 0) return null;
  return { framework: rule.framework, evidence, version };
}

function collectViteEvidence(filePaths: Set<string>, deps: Record<string, string>): Candidate | null {
  const evidence: string[] = [];
  let version: string | null = null;
  if (deps["vite"]) {
    evidence.push(`package dependency "vite"`);
    version = deps["vite"];
  }
  for (const file of VITE_FILES) {
    if (filePaths.has(file)) evidence.push(`"${file}" exists`);
  }
  if (evidence.length === 0) return null;
  return { framework: "Vite", evidence, version };
}

/** Confidence is deliberately a small set of discrete levels: 2+ pieces of
 * independent evidence (e.g. both the dependency and a config file) is high
 * confidence; a single signal is still fairly confident since these are
 * framework-specific names, not generic ones; a Vite-only fallback with
 * multiple config files but no matching dependency is lower confidence,
 * matching the "ambiguous project" requirement (don't aggressively mutate
 * on weak evidence). */
function confidenceFor(evidenceCount: number, isFallbackVite: boolean): number {
  if (isFallbackVite) return evidenceCount >= 2 ? 0.7 : 0.55;
  return evidenceCount >= 2 ? 0.95 : 0.8;
}

export function detectFramework(files: ClientFile[]): FrameworkDetectionResult {
  const filePaths = new Set(files.map((f) => f.path));
  const pkgFile = files.find((f) => f.path === "package.json");

  let deps: Record<string, string> = {};
  if (pkgFile) {
    try {
      const decoded = new TextDecoder("utf-8").decode(pkgFile.bytes);
      const pkg = JSON.parse(decoded);
      deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    } catch {
      // malformed package.json — fall through with no dependency evidence,
      // still try file-based detection below
    }
  }

  const strongCandidates: Candidate[] = [];
  for (const rule of FRAMEWORK_RULES) {
    const candidate = collectEvidence(rule, filePaths, deps);
    if (candidate) strongCandidates.push(candidate);
  }

  if (strongCandidates.length > 0) {
    // Prefer the candidate with the most evidence; ties broken by rule order
    // above (which lists more distinctive frameworks first).
    const winner = strongCandidates.reduce((best, c) => (c.evidence.length > best.evidence.length ? c : best));
    const ambiguous = strongCandidates.filter((c) => c !== winner && c.evidence.length === winner.evidence.length);
    const confidence = ambiguous.length > 0 ? 0.5 : confidenceFor(winner.evidence.length, false);
    const evidence = ambiguous.length > 0
      ? [...winner.evidence, `ambiguous: also matched ${ambiguous.map((c) => c.framework).join(", ")}`]
      : winner.evidence;
    return { framework: winner.framework, confidence, evidence, version: winner.version };
  }

  // No meta-framework evidence at all — Vite (or nothing) is the fallback.
  const vite = collectViteEvidence(filePaths, deps);
  if (vite) {
    return { framework: vite.framework, confidence: confidenceFor(vite.evidence.length, true), evidence: vite.evidence, version: vite.version };
  }

  return { framework: null, confidence: 0, evidence: [], version: null };
}
