import { scanSpans, isInsideLiteralOrComment } from "./lex";
import { dirName, extOf, baseName } from "./path-security";

export type SwSourceType =
  | "likely-service-worker"
  | "possible-service-worker"
  | "generator-source"
  | "registration-target"
  | "unknown";

export type Confidence = "high" | "medium" | "low";

export interface ProjectTextFile {
  path: string;
  /** Decoded text content, or null for binary/undecodable files. */
  text: string | null;
}

export interface SwCandidate {
  path: string;
  sourceType: SwSourceType;
  confidence: Confidence;
  reasons: string[];
}

export interface SwRegistrationMatch {
  /** File containing the `navigator.serviceWorker.register(...)` call. */
  path: string;
  /** The literal string argument, if statically resolvable (not a template with interpolation). */
  targetLiteral: string | null;
  /** targetLiteral resolved against the registering file's directory, when it looks like a relative path. */
  resolvedTarget: string | null;
}

export interface ExistingServiceWorkerState {
  path: string | null;
  confidence: Confidence | null;
  sourceType: SwSourceType | null;
  registered: boolean;
  registrationTarget: string | null;
  candidates: SwCandidate[];
  registrations: SwRegistrationMatch[];
  /** Human-readable notes explaining the decisions above, for diagnostics/logging. */
  diagnostics: string[];
}

const SW_NAME_RE = /(^|\/)(sw|service-worker|serviceworker)\.(js|mjs|ts)$/i;
const CANDIDATE_EXT = new Set(["js", "mjs", "ts"]);
const NON_RUNTIME_DIR_RE = /(^|\/)(docs?|examples?|example|tests?|__tests__|__mocks__|fixtures?|spec|specs|\.storybook|stories|demo|samples?|templates?)\//i;
const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$/i;
const TYPE_DECL_RE = /\.d\.ts$/i;

// Worker-scope API signatures. These are what a *live* Service Worker
// actually calls at the top level — not just words that might appear in
// prose or a generator's output string.
const WORKER_API_PATTERNS: RegExp[] = [
  /self\s*\.\s*addEventListener\s*\(\s*["'`](install|activate|fetch|push|message)["'`]/g,
  /\bcaches\s*\.\s*(open|match|keys|delete)\s*\(/g,
  /\bclients\s*\.\s*claim\s*\(/g,
  /\bskipWaiting\s*\(/g,
  /\bServiceWorkerGlobalScope\b/g,
  /\bworkbox\b/g,
];

const REGISTER_CALL_RE = /navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;

function findLiveAndGeneratedApiHits(text: string): { live: boolean; generatedOnly: boolean } {
  const spans = scanSpans(text);
  let live = false;
  let generated = false;
  for (const re of WORKER_API_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (isInsideLiteralOrComment(spans, m.index)) {
        generated = true;
      } else {
        live = true;
      }
    }
  }
  return { live, generatedOnly: generated && !live };
}

function classifyFile(file: ProjectTextFile): SwCandidate | null {
  const { path, text } = file;
  const ext = extOf(path);
  const name = baseName(path);
  if (TYPE_DECL_RE.test(name) || TEST_FILE_RE.test(name)) return null;
  if (!CANDIDATE_EXT.has(ext)) return null;

  const nameMatches = SW_NAME_RE.test(path);
  const inNonRuntimeDir = NON_RUNTIME_DIR_RE.test(path);

  if (text == null) {
    // Binary/undecodable — can only go on the filename, and only weakly.
    if (!nameMatches) return null;
    return {
      path,
      sourceType: "possible-service-worker",
      confidence: "low",
      reasons: ["filename matches Service Worker naming convention, but content could not be read to confirm"],
    };
  }

  const { live, generatedOnly } = findLiveAndGeneratedApiHits(text);

  if (generatedOnly) {
    return {
      path,
      sourceType: "generator-source",
      confidence: "high",
      reasons: [
        "Service Worker API calls (self.addEventListener, caches.*, skipWaiting, ...) appear only inside a string/template literal — this file builds Service Worker source text, it is not one itself",
      ],
    };
  }

  if (live) {
    const reasons: string[] = ["contains top-level Service Worker API usage (self.addEventListener/caches/clients.claim/skipWaiting)"];
    let confidence: Confidence = nameMatches ? "high" : "medium";
    let sourceType: SwSourceType = confidence === "high" ? "likely-service-worker" : "possible-service-worker";

    if (inNonRuntimeDir) {
      confidence = "low";
      sourceType = "possible-service-worker";
      reasons.push("located under a docs/examples/tests/fixtures-style directory, treated as non-authoritative");
    }

    return { path, sourceType, confidence, reasons };
  }

  if (nameMatches) {
    const reasons = ["filename matches Service Worker naming convention, but no worker-specific APIs were found in its content"];
    if (inNonRuntimeDir) reasons.push("also located under a docs/examples/tests/fixtures-style directory");
    return {
      path,
      sourceType: "possible-service-worker",
      confidence: "low",
      reasons,
    };
  }

  return null;
}

/** Resolves a relative-looking import/register target against the directory of the file that referenced it. */
function resolveRelativeTarget(fromDir: string, literal: string): string | null {
  if (!literal) return null;
  if (/^https?:\/\//i.test(literal)) return null; // absolute URL, not a project file
  if (literal.includes("${") || literal.includes("`")) return null; // had interpolation, not fully static

  let target = literal;
  let base = fromDir;
  if (target.startsWith("/")) {
    // Root-relative: resolved against the deploy root, not the file's own
    // directory. We can't know the exact serving root here (that's a
    // framework/base-path concern), so surface it relative to project root
    // and let callers reconcile it against the actual asset root.
    return target.slice(1);
  }

  const fromParts = base.split("/").filter(Boolean);
  const relParts = target.split("/").filter(Boolean);
  for (const seg of relParts) {
    if (seg === ".") continue;
    if (seg === "..") {
      fromParts.pop();
    } else {
      fromParts.push(seg);
    }
  }
  return fromParts.join("/");
}

function findRegistrations(files: ProjectTextFile[]): SwRegistrationMatch[] {
  const out: SwRegistrationMatch[] = [];
  for (const file of files) {
    if (file.text == null) continue;
    const spans = scanSpans(file.text);
    REGISTER_CALL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REGISTER_CALL_RE.exec(file.text))) {
      if (isInsideLiteralOrComment(spans, m.index)) continue; // generator code building a register() call as text, not a real call
      const literal = m[2];
      const resolved = resolveRelativeTarget(dirName(file.path), literal);
      out.push({ path: file.path, targetLiteral: literal, resolvedTarget: resolved });
    }
  }
  return out;
}

function candidateRank(c: SwCandidate): number {
  const confRank = c.confidence === "high" ? 2 : c.confidence === "medium" ? 1 : 0;
  const typeBonus = c.sourceType === "likely-service-worker" ? 1 : 0;
  return confRank * 10 + typeBonus;
}

export function detectServiceWorker(files: ProjectTextFile[]): ExistingServiceWorkerState {
  const diagnostics: string[] = [];
  const candidates: SwCandidate[] = [];
  for (const file of files) {
    const c = classifyFile(file);
    if (c) candidates.push(c);
  }

  const registrations = findRegistrations(files);

  for (const c of candidates) {
    if (c.sourceType === "generator-source") {
      diagnostics.push(`Ignored ${c.path}: ${c.reasons[0]}`);
    }
  }

  const runnable = candidates.filter((c) => c.sourceType === "likely-service-worker" || c.sourceType === "possible-service-worker");

  // Prefer a candidate that's actually referenced by a register() call —
  // that's the strongest possible evidence, stronger than filename/location
  // heuristics alone.
  function isRegisteredTarget(path: string): boolean {
    const base = baseName(path);
    return registrations.some((r) => r.resolvedTarget === path || (r.resolvedTarget && baseName(r.resolvedTarget) === base));
  }

  const registeredCandidates = runnable.filter((c) => isRegisteredTarget(c.path));
  // Without a registration to confirm it, a "low confidence" candidate (e.g.
  // a docs/examples/tests-style sw.js, or a bare filename match with no
  // worker APIs) is a guess, not a detection — don't promote it to the
  // project's existing Service Worker. It still stays visible in
  // `candidates` for diagnostics.
  const confidentRunnable = runnable.filter((c) => c.confidence !== "low");
  const pool = registeredCandidates.length > 0 ? registeredCandidates : confidentRunnable;
  pool.sort((a, b) => candidateRank(b) - candidateRank(a));
  const chosen = pool[0] ?? null;

  if (chosen && registeredCandidates.length > 0) {
    // Bump confidence: an actual registration call pointing at this file is
    // the most reliable signal we have.
    diagnostics.push(`Detected SW candidate ${chosen.path} confirmed by navigator.serviceWorker.register() call`);
  }

  const registered = !!chosen && isRegisteredTarget(chosen.path);
  const registrationTarget = registrations.length > 0 ? registrations[0].resolvedTarget ?? registrations[0].targetLiteral : null;

  if (!chosen && registrations.length > 0) {
    diagnostics.push(`Found navigator.serviceWorker.register() call(s) but no matching Service Worker file — likely a broken/incomplete existing PWA`);
  }
  if (chosen && registrations.length === 0) {
    diagnostics.push(`Found Service Worker candidate ${chosen.path} but no registration call — not treated as an active PWA`);
  }

  return {
    path: chosen?.path ?? null,
    confidence: chosen?.confidence ?? null,
    sourceType: chosen?.sourceType ?? null,
    // "Active" requires both a real file AND a registration pointing at it —
    // a file alone is not enough (case D in the spec), and a registration
    // with no matching file is reported, not assumed (case B).
    registered,
    registrationTarget,
    candidates,
    registrations,
    diagnostics,
  };
}
