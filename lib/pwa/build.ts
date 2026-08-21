import type { ClientFile } from "@/lib/client-zip";
import type { ProjectAnalysis, PwaFormState, GenerateResult, GenerateStep, MutationPlanEntry, PwaStrategy } from "./types";
import { buildManifest, serializeManifest, type ManifestIconSpec } from "./manifest";
import { injectPwaHtml } from "./html";
import { generateServiceWorkerSource, generateRegistrationSnippet } from "./service-worker";
import { renderIconPng, ICON_SIZES } from "./icons";
import { generateNextManifestTs, generateRegisterSwComponent, patchNextLayoutForServiceWorker, nextManifestPathFor } from "./next-app-router";
import { patchNuxtConfigHead, generateNuxtSwPlugin } from "./nuxt";
import { resolvePublicPath } from "./detect/base-path";
import { validateOutput, PwaValidationError } from "./validate";
import { findMiddlewarePath } from "./detect/middleware-detect";
import { patchMiddlewarePublicPaths } from "./middleware-patch";

function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx + 1);
}

/** Relative path from `fromDir` (e.g. "app/", or "" for root) to `toPath`, so an
 * existing manifest/SW that lives outside the entry HTML's own folder still gets
 * a correct href/import path instead of a naively-sliced string. */
function relativePath(fromDir: string, toPath: string): string {
  const fromParts = fromDir.split("/").filter(Boolean);
  const toParts = toPath.split("/").filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) i++;
  const ups = fromParts.length - i;
  const downs = toParts.slice(i);
  return "../".repeat(ups) + downs.join("/");
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");

/** Best-effort mapping from a project file path to the root-relative public
 * URL a browser would actually fetch it at — used only to tell an existing
 * middleware.ts auth gate which paths to let through, so an approximate
 * answer here is far better than none (see middleware-patch.ts for why this
 * matters). Next's App Router manifest
 * file-convention is special-cased since it's always served at
 * /manifest.webmanifest regardless of where manifest.ts physically lives;
 * everything else is resolved relative to the project's "public/" folder,
 * which is how both Next.js and Nuxt serve static assets at the root. */
function servedUrlFor(strategy: PwaStrategy, filePath: string, kind: "manifest" | "sw"): string {
  if (strategy === "next-app-router" && kind === "manifest") {
    return resolvePublicPath("/", "manifest.webmanifest");
  }
  const publicMarker = "public/";
  const idx = filePath.indexOf(publicMarker);
  const rel = idx !== -1 ? filePath.slice(idx + publicMarker.length) : filePath.replace(/^\/+/, "");
  return resolvePublicPath("/", rel);
}

export interface BuildInputs {
  files: ClientFile[];
  analysis: ProjectAnalysis;
  form: PwaFormState;
  iconImage: HTMLImageElement;
  onStep?: (step: GenerateStep) => void;
}

interface Ctx {
  analysis: ProjectAnalysis;
  form: PwaFormState;
  iconImage: HTMLImageElement;
  onStep?: (step: GenerateStep) => void;
  byPath: Map<string, ClientFile>;
  added: string[];
  updated: string[];
  preserved: string[];
  plan: MutationPlanEntry[];
  put: (path: string, bytes: Uint8Array) => void;
  /** Icon-safety-aware write: only overwrites an existing file at `path` if
   * form.replaceIcons is true. Otherwise records a PRESERVE decision and
   * leaves the user's existing icon untouched — "Keep Manifest" must never
   * be read as "ok to overwrite icons" (spec section 6). */
  putIcon: (path: string, render: () => Promise<Uint8Array>) => Promise<void>;
  recordPlan: (path: string, action: MutationPlanEntry["action"], reason: string) => void;
  /** Path of the manifest in effect after this run (created/updated OR the
   * existing one being preserved) — set by each strategy so OutputValidator
   * knows what to check. Null if no manifest is in play. */
  manifestPathUsed: string | null;
  /** Entry HTML actually relevant to this run, for HTML validation. Null for
   * strategies (next-app-router, nuxt3) that don't do head injection. */
  entryHtmlPathUsed: string | null;
  /** Public URL of the manifest/service worker Harbor PWA created or
   * updated this run (not set for a preserved pre-existing file — those
   * predate Harbor PWA and are the project author's own concern). Feeds the
   * middleware.ts public-path patch below; null if nothing was managed. */
  manifestUrlUsed: string | null;
  serviceWorkerUrlUsed: string | null;
}

export async function generatePwaPackage(inputs: BuildInputs): Promise<GenerateResult> {
  const { files, analysis, form, iconImage, onStep } = inputs;

  const byPath = new Map(files.map((f) => [f.path, f]));
  const added: string[] = [];
  const updated: string[] = [];
  const preserved: string[] = [];
  const plan: MutationPlanEntry[] = [];

  function recordPlan(path: string, action: MutationPlanEntry["action"], reason: string) {
    plan.push({ path, action, reason });
  }

  function put(path: string, bytes: Uint8Array) {
    const existed = byPath.has(path);
    const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
    byPath.set(path, { path, ext, bytes });
    if (existed) {
      if (!updated.includes(path)) updated.push(path);
    } else {
      if (!added.includes(path)) added.push(path);
    }
  }

  async function putIcon(path: string, render: () => Promise<Uint8Array>) {
    const existed = byPath.has(path);
    if (existed && !form.replaceIcons) {
      if (!preserved.includes(path)) preserved.push(path);
      recordPlan(path, "PRESERVE", "existing icon found, keeping by default (replaceIcons not set)");
      return;
    }
    const bytes = await render();
    put(path, bytes);
    recordPlan(path, existed ? "UPDATE" : "CREATE", existed ? "existing icon replaced (replaceIcons enabled)" : "no existing icon at this path");
  }

  const ctx: Ctx = {
    analysis,
    form,
    iconImage,
    onStep,
    byPath,
    added,
    updated,
    preserved,
    plan,
    put,
    putIcon,
    recordPlan,
    manifestPathUsed: null,
    entryHtmlPathUsed: null,
    manifestUrlUsed: null,
    serviceWorkerUrlUsed: null,
  };

  let manualSteps: string[];
  switch (analysis.strategy) {
    case "html-shell":
      manualSteps = await runHtmlShell(ctx);
      break;
    case "next-app-router":
      manualSteps = await runNextAppRouter(ctx);
      break;
    case "nuxt3":
      manualSteps = await runNuxt3(ctx);
      break;
    default:
      throw new Error("unsupported_strategy");
  }

  // If the target project ships its own middleware.ts auth gate, exempt the
  // manifest/service-worker Harbor PWA just created or updated so Chrome can
  // fetch them (and evaluate PWA installability) before the user logs in.
  // Only paths actually managed this run are considered — see
  // Ctx.manifestUrlUsed/serviceWorkerUrlUsed. Never invents an allowlist.
  const publicUrlsToEnsure = [ctx.manifestUrlUsed, ctx.serviceWorkerUrlUsed].filter((u): u is string => !!u);
  if (publicUrlsToEnsure.length > 0) {
    const middlewarePath = findMiddlewarePath(byPath);
    if (middlewarePath) {
      const middlewareFile = byPath.get(middlewarePath)!;
      const middlewareCode = dec.decode(middlewareFile.bytes);
      const mwPatch = patchMiddlewarePublicPaths(middlewareCode, publicUrlsToEnsure);
      if (mwPatch.changed) {
        put(middlewarePath, enc.encode(mwPatch.code));
        recordPlan(
          middlewarePath,
          "UPDATE",
          `added ${mwPatch.addedPaths.join(", ")} to the existing public-path allowlist (${mwPatch.varName}) so the auth gate never blocks the PWA manifest/service worker`
        );
      } else if (mwPatch.notes.includes("middleware_no_public_path_list_found")) {
        manualSteps.push("middleware_no_public_path_list_found");
        recordPlan(
          middlewarePath,
          "WARNING",
          `found an auth-gate middleware.ts but couldn't identify its public-path allowlist automatically — add these paths so they bypass auth: ${publicUrlsToEnsure.join(", ")}`
        );
      }
      // "middleware_paths_already_public": nothing to do, nothing to record.
    }
  }

  // Post-generation validation (Phase 4 §2) — must run before packaging.
  // A failing validation must never reach a successful-generation ZIP; the
  // caller's original `files` array was never mutated (byPath is a fresh
  // copy), so throwing here already leaves the original project untouched.
  const validation = validateOutput({
    plan,
    originalFiles: files,
    finalByPath: byPath,
    manifestPath: ctx.manifestPathUsed,
    entryHtmlPath: ctx.entryHtmlPathUsed,
    assetRoot: analysis.assetRoot || "public",
  });
  if (!validation.valid) {
    throw new PwaValidationError(validation);
  }

  onStep?.("packaging");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of byPath.values()) {
    zip.file(file.path, file.bytes);
  }
  const zipBlob: Blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

  return {
    zipBlob,
    added: added.sort(),
    updated: updated.sort(),
    unchanged: preserved.sort(),
    manualSteps,
    mutationPlan: plan,
    validationWarnings: validation.warnings,
  };
}

/** Static HTML, Vite, CRA, Angular, SvelteKit, Astro, Gatsby, Remix, and Next.js Pages Router. */
async function runHtmlShell(ctx: Ctx): Promise<string[]> {
  const { analysis, form, iconImage, onStep, byPath, put } = ctx;
  if (!analysis.entryHtmlPath) throw new Error("no_entry_html");
  const entryPath = analysis.entryHtmlPath;
  const manualSteps: string[] = [];

  // Next.js Pages Router without a custom pages/_document.tsx: synthesize a
  // minimal one first, then treat it exactly like any other html-shell.
  // wasEntrySynthesized must be captured from the *original* project state
  // (before this write) — checking byPath.has(entryPath) later would always
  // find it "existing" since the boilerplate has already been put() there.
  const wasEntrySynthesized = !!analysis.entryHtmlNeedsCreate;
  if (analysis.entryHtmlNeedsCreate) {
    const boilerplate = `import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head></Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
`;
    put(entryPath, enc.encode(boilerplate));
  }

  const entryDir = dirOf(entryPath);
  // Vite serves anything under `public/` verbatim from the site root
  // regardless of where index.html lives, so icons/manifest/SW need to go
  // there (and use root-relative hrefs) rather than sit next to index.html
  // at the project root, where the bundler would never pick them up.
  const useAssetRoot = analysis.framework === "Vite" || (!!analysis.assetRoot && !entryPath.startsWith(`${analysis.assetRoot}/`));
  const assetBase = useAssetRoot ? `${analysis.assetRoot || "public"}/` : entryDir;
  const iconsDir = `${assetBase}icons/`;

  function hrefFor(targetPath: string): string {
    if (useAssetRoot) {
      const base = analysis.assetRoot || "public";
      // TODO(base-path): once a strategy populates a real deployment base
      // path on ProjectAnalysis, pass it here instead of "/".
      return resolvePublicPath("/", targetPath.slice(base.length + 1));
    }
    return relativePath(entryDir, targetPath);
  }

  const manageManifest = form.replaceManifest || !analysis.existingManifestPath;
  const manageServiceWorker = form.replaceServiceWorker || !analysis.existingServiceWorkerPath;

  // 1. Icons
  onStep?.("icons");
  const iconFiles: { fileName: string; purpose: "manifest" | "apple"; size: number }[] = [];
  for (const spec of ICON_SIZES) {
    const iconPath = `${iconsDir}${spec.fileName}`;
    await ctx.putIcon(iconPath, () => renderIconPng(iconImage, spec.size));
    iconFiles.push({ fileName: spec.fileName, purpose: spec.purpose, size: spec.size });
  }

  // 2. Manifest
  onStep?.("manifest");
  let manifestHref: string | null = null;
  let appleIconHref: string | null = null;
  if (manageManifest) {
    const manifestPath = analysis.existingManifestPath && form.replaceManifest ? analysis.existingManifestPath : `${assetBase}manifest.json`;
    const manifestDir = dirOf(manifestPath);
    const manifestIcons: ManifestIconSpec[] = iconFiles
      .filter((f) => f.purpose === "manifest")
      .map((f) => ({ src: relativePath(manifestDir, `${iconsDir}${f.fileName}`), sizes: `${f.size}x${f.size}`, type: "image/png" }));
    const manifest = buildManifest(form, manifestIcons);
    const existed = byPath.has(manifestPath);
    put(manifestPath, enc.encode(serializeManifest(manifest)));
    ctx.recordPlan(manifestPath, existed ? "UPDATE" : "CREATE", existed ? "existing manifest found, user chose Replace" : "no existing manifest detected");
    manifestHref = hrefFor(manifestPath);
    ctx.manifestPathUsed = manifestPath;
    ctx.manifestUrlUsed = servedUrlFor(analysis.strategy, manifestPath, "manifest");
  } else if (analysis.existingManifestPath) {
    manifestHref = hrefFor(analysis.existingManifestPath);
    ctx.recordPlan(analysis.existingManifestPath, "PRESERVE", "existing manifest found, keeping by default");
    ctx.manifestPathUsed = analysis.existingManifestPath;
  }
  const appleIconFile = iconFiles.find((f) => f.purpose === "apple");
  if (appleIconFile) {
    appleIconHref = hrefFor(`${iconsDir}${appleIconFile.fileName}`);
  }

  // 3. Service worker
  onStep?.("sw");
  let swHref: string | null = null;
  if (manageServiceWorker) {
    const version = Date.now().toString(36);
    const swPath = analysis.existingServiceWorkerPath && form.replaceServiceWorker ? analysis.existingServiceWorkerPath : `${assetBase}service-worker.js`;
    swHref = hrefFor(swPath);
    const existed = byPath.has(swPath);
    put(swPath, enc.encode(generateServiceWorkerSource(version)));
    ctx.recordPlan(swPath, existed ? "UPDATE" : "CREATE", existed ? "existing Service Worker found, user chose Replace" : "no active Service Worker detected");
    ctx.serviceWorkerUrlUsed = servedUrlFor(analysis.strategy, swPath, "sw");
  } else if (analysis.existingServiceWorkerPath) {
    ctx.recordPlan(analysis.existingServiceWorkerPath, "PRESERVE", "existing Service Worker found, keeping by default");
  }

  // 4. HTML integration
  onStep?.("html");
  ctx.entryHtmlPathUsed = entryPath;
  const entryFile = byPath.get(entryPath)!;
  const htmlText = dec.decode(entryFile.bytes);
  const result = injectPwaHtml(htmlText, {
    manifestHref: manifestHref || "manifest.json",
    themeColor: form.themeColor,
    appleTouchIconHref: appleIconHref,
    swRegistrationScript: swHref ? generateRegistrationSnippet(swHref) : null,
    manageManifestTags: manageManifest,
    manageServiceWorker: manageServiceWorker,
  });
  if (result.changed) {
    put(entryPath, enc.encode(result.html));
    ctx.recordPlan(
      entryPath,
      wasEntrySynthesized ? "CREATE" : "UPDATE",
      wasEntrySynthesized
        ? "pages/_document.tsx did not exist — synthesized it and injected PWA <head> tags/registration script"
        : "PWA <head> tags/registration script injected"
    );
  } else if (result.notes.includes("no_head_tag")) {
    manualSteps.push("html_shell_no_head_found");
    ctx.recordPlan(entryPath, "WARNING", "no safe <head> insertion point found — left untouched");
  }

  return manualSteps;
}

/** Next.js App Router: file-convention icons + manifest.ts, layout.tsx only touched to mount the SW component. */
async function runNextAppRouter(ctx: Ctx): Promise<string[]> {
  const { analysis, form, iconImage, onStep, byPath, put } = ctx;
  if (!analysis.configFilePath) throw new Error("no_config_file");
  const layoutPath = analysis.configFilePath;
  const layoutDir = dirOf(layoutPath);
  const manualSteps: string[] = [];

  const manageManifest = form.replaceManifest || !analysis.existingManifestPath;
  const manageServiceWorker = form.replaceServiceWorker || !analysis.existingServiceWorkerPath;

  // 1. Icons — the manifest set under public/icons/, plus Next's own
  // icon.png / apple-icon.png file convention right next to layout.tsx
  // (auto-linked into every page's <head>, no patch required).
  onStep?.("icons");
  for (const spec of ICON_SIZES) {
    await ctx.putIcon(`public/icons/${spec.fileName}`, () => renderIconPng(iconImage, spec.size));
  }
  await ctx.putIcon(`${layoutDir}icon.png`, () => renderIconPng(iconImage, 512));
  await ctx.putIcon(`${layoutDir}apple-icon.png`, () => renderIconPng(iconImage, 180));

  // 2. Manifest — <app-root>/manifest.ts, Next's own file convention. Must
  // live in the same App Router root as layout.tsx — "app/" when the
  // project uses app/layout.tsx, "src/app/" when it uses src/app/layout.tsx
  // — using the same layoutDir already computed for the icon files above.
  // Never hardcode "app/manifest.ts": that silently creates a second,
  // duplicate "app/" root in src/app projects that Next.js will never serve.
  onStep?.("manifest");
  const manifestPath = nextManifestPathFor(layoutPath);
  if (manageManifest) {
    const src = generateNextManifestTs(
      form,
      resolvePublicPath("/", "icons/icon-192.png"),
      resolvePublicPath("/", "icons/icon-512.png")
    );
    const existed = byPath.has(manifestPath);
    put(manifestPath, enc.encode(src));
    ctx.recordPlan(manifestPath, existed ? "UPDATE" : "CREATE", "Next.js file-convention manifest");
    ctx.manifestPathUsed = manifestPath;
    ctx.manifestUrlUsed = servedUrlFor(analysis.strategy, manifestPath, "manifest");
    if (analysis.existingManifestPath) {
      manualSteps.push("next_old_manifest_left_in_place");
      ctx.recordPlan(analysis.existingManifestPath, "WARNING", `an older manifest file still exists alongside the new ${manifestPath} — review manually`);
    }
  } else {
    manualSteps.push("manifest_skipped_by_user");
    if (analysis.existingManifestPath) {
      ctx.recordPlan(analysis.existingManifestPath, "PRESERVE", "existing manifest found, keeping by default");
    }
  }

  // 3. Service worker + registration component mounted in layout.tsx.
  onStep?.("sw");
  if (manageServiceWorker) {
    const version = Date.now().toString(36);
    const existedSw = byPath.has("public/service-worker.js");
    put("public/service-worker.js", enc.encode(generateServiceWorkerSource(version)));
    ctx.recordPlan("public/service-worker.js", existedSw ? "UPDATE" : "CREATE", existedSw ? "existing Service Worker found, user chose Replace" : "no active Service Worker detected");
    ctx.serviceWorkerUrlUsed = servedUrlFor(analysis.strategy, "public/service-worker.js", "sw");

    const componentPath = `${layoutDir}harbor-register-sw.tsx`;
    const existedComponent = byPath.has(componentPath);
    put(componentPath, enc.encode(generateRegisterSwComponent(resolvePublicPath("/", "service-worker.js"))));
    ctx.recordPlan(componentPath, existedComponent ? "UPDATE" : "CREATE", "Service Worker registration component");

    const layoutFile = byPath.get(layoutPath)!;
    const layoutText = dec.decode(layoutFile.bytes);
    const importPath = "./" + componentPath.slice(layoutDir.length).replace(/\.tsx?$/, "");
    const patch = patchNextLayoutForServiceWorker(layoutText, importPath);
    if (patch.changed) {
      put(layoutPath, enc.encode(patch.code));
      ctx.recordPlan(layoutPath, "UPDATE", "mounted <HarborRegisterSW /> before </body>");
    } else if (patch.notes.includes("layout_no_body_tag")) {
      manualSteps.push("next_layout_manual_sw_mount");
      ctx.recordPlan(layoutPath, "WARNING", "no </body> tag found — could not auto-mount the SW registration component");
    }
  } else if (analysis.existingServiceWorkerPath) {
    ctx.recordPlan(analysis.existingServiceWorkerPath, "PRESERVE", "existing Service Worker found, keeping by default");
  }

  onStep?.("html"); // no-op for this strategy — kept so the progress UI still advances through the same steps
  return manualSteps;
}

/** Nuxt 3: icons + manifest.json under public/, nuxt.config `app.head` patched, SW registered via a client plugin. */
async function runNuxt3(ctx: Ctx): Promise<string[]> {
  const { analysis, form, iconImage, onStep, byPath, put } = ctx;
  if (!analysis.configFilePath) throw new Error("no_config_file");
  const manualSteps: string[] = [];

  const manageManifest = form.replaceManifest || !analysis.existingManifestPath;
  const manageServiceWorker = form.replaceServiceWorker || !analysis.existingServiceWorkerPath;

  onStep?.("icons");
  const iconFiles: { fileName: string; purpose: "manifest" | "apple"; size: number }[] = [];
  for (const spec of ICON_SIZES) {
    await ctx.putIcon(`public/icons/${spec.fileName}`, () => renderIconPng(iconImage, spec.size));
    iconFiles.push({ fileName: spec.fileName, purpose: spec.purpose, size: spec.size });
  }
  const appleFile = iconFiles.find((f) => f.purpose === "apple")!;
  const appleIconHref = resolvePublicPath("/", `icons/${appleFile.fileName}`);

  onStep?.("manifest");
  let manifestHref = resolvePublicPath("/", "manifest.json");
  if (manageManifest) {
    const manifestIcons: ManifestIconSpec[] = iconFiles
      .filter((f) => f.purpose === "manifest")
      .map((f) => ({ src: resolvePublicPath("/", `icons/${f.fileName}`), sizes: `${f.size}x${f.size}`, type: "image/png" }));
    const manifest = buildManifest(form, manifestIcons);
    const existed = byPath.has("public/manifest.json");
    put("public/manifest.json", enc.encode(serializeManifest(manifest)));
    ctx.recordPlan("public/manifest.json", existed ? "UPDATE" : "CREATE", existed ? "existing manifest found, user chose Replace" : "no existing manifest detected");
    ctx.manifestPathUsed = "public/manifest.json";
    ctx.manifestUrlUsed = servedUrlFor(analysis.strategy, "public/manifest.json", "manifest");
  } else if (analysis.existingManifestPath) {
    manifestHref = resolvePublicPath("/", analysis.existingManifestPath.replace(/^public\//, ""));
    ctx.recordPlan(analysis.existingManifestPath, "PRESERVE", "existing manifest found, keeping by default");
    ctx.manifestPathUsed = analysis.existingManifestPath;
  }

  onStep?.("html");
  const cfgFile = byPath.get(analysis.configFilePath)!;
  const cfgText = dec.decode(cfgFile.bytes);
  const patch = patchNuxtConfigHead(cfgText, form, manifestHref, appleIconHref);
  if (patch.changed) {
    put(analysis.configFilePath, enc.encode(patch.code));
    ctx.recordPlan(analysis.configFilePath, "UPDATE", "merged PWA head tags into existing app.head config");
  } else {
    manualSteps.push(patch.notes[0] === "nuxt_head_already_patched" ? "nuxt_head_already_patched" : "nuxt_config_manual_head");
    ctx.recordPlan(analysis.configFilePath, "WARNING", "could not safely merge app.head config automatically — left untouched");
  }

  onStep?.("sw");
  if (manageServiceWorker) {
    const version = Date.now().toString(36);
    const existedSw = byPath.has("public/service-worker.js");
    put("public/service-worker.js", enc.encode(generateServiceWorkerSource(version)));
    ctx.recordPlan("public/service-worker.js", existedSw ? "UPDATE" : "CREATE", existedSw ? "existing Service Worker found, user chose Replace" : "no active Service Worker detected");
    ctx.serviceWorkerUrlUsed = servedUrlFor(analysis.strategy, "public/service-worker.js", "sw");
    const nuxtSwPluginPath = "plugins/harbor-pwa-sw.client.ts";
    const existedNuxtSwPlugin = byPath.has(nuxtSwPluginPath);
    put(nuxtSwPluginPath, enc.encode(generateNuxtSwPlugin(resolvePublicPath("/", "service-worker.js"))));
    ctx.recordPlan(nuxtSwPluginPath, existedNuxtSwPlugin ? "UPDATE" : "CREATE", "Nuxt client plugin for Service Worker registration");
  } else if (analysis.existingServiceWorkerPath) {
    ctx.recordPlan(analysis.existingServiceWorkerPath, "PRESERVE", "existing Service Worker found, keeping by default");
  }

  return manualSteps;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
