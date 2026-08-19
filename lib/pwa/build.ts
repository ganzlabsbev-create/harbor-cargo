import type { ClientFile } from "@/lib/client-zip";
import type { ProjectAnalysis, PwaFormState, GenerateResult, GenerateStep } from "./types";
import { buildManifest, serializeManifest, type ManifestIconSpec } from "./manifest";
import { injectPwaHtml } from "./html";
import { generateServiceWorkerSource, generateRegistrationSnippet } from "./service-worker";
import { renderIconPng, ICON_SIZES } from "./icons";

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

export interface BuildInputs {
  files: ClientFile[];
  analysis: ProjectAnalysis;
  form: PwaFormState;
  iconImage: HTMLImageElement;
  onStep?: (step: GenerateStep) => void;
}

export async function generatePwaPackage(inputs: BuildInputs): Promise<GenerateResult> {
  const { files, analysis, form, iconImage, onStep } = inputs;

  if (!analysis.entryHtmlPath) {
    throw new Error("no_entry_html");
  }
  const entryDir = dirOf(analysis.entryHtmlPath);
  const iconsDir = `${entryDir}icons/`;

  const manageManifest = form.replaceManifest || !analysis.existingManifestPath;
  const manageServiceWorker = form.replaceServiceWorker || !analysis.existingServiceWorkerPath;

  const byPath = new Map(files.map((f) => [f.path, f]));
  const added: string[] = [];
  const updated: string[] = [];

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

  // 1. Icons — always co-located with the entry HTML, regardless of where an
  // existing manifest happens to live, so the folder layout stays predictable.
  onStep?.("icons");
  const iconFiles: { fileName: string; purpose: "manifest" | "apple"; size: number }[] = [];
  for (const spec of ICON_SIZES) {
    const png = await renderIconPng(iconImage, spec.size);
    put(`${iconsDir}${spec.fileName}`, png);
    iconFiles.push({ fileName: spec.fileName, purpose: spec.purpose, size: spec.size });
  }

  // 2. Manifest — icon `src` values are resolved relative to wherever the
  // manifest itself ends up (which may differ from iconsDir if we're
  // replacing an existing manifest.json that lived elsewhere).
  onStep?.("manifest");
  let manifestRelHref: string | null = null;
  let appleIconPath: string | null = null;
  if (manageManifest) {
    const manifestPath = analysis.existingManifestPath && form.replaceManifest ? analysis.existingManifestPath : `${entryDir}manifest.json`;
    const manifestDir = dirOf(manifestPath);
    const manifestIcons: ManifestIconSpec[] = iconFiles
      .filter((f) => f.purpose === "manifest")
      .map((f) => ({ src: relativePath(manifestDir, `${iconsDir}${f.fileName}`), sizes: `${f.size}x${f.size}`, type: "image/png" }));
    const manifest = buildManifest(form, manifestIcons);
    put(manifestPath, enc.encode(serializeManifest(manifest)));
    manifestRelHref = relativePath(entryDir, manifestPath);
  } else if (analysis.existingManifestPath) {
    manifestRelHref = relativePath(entryDir, analysis.existingManifestPath);
  }
  const appleIconFile = iconFiles.find((f) => f.purpose === "apple");
  if (appleIconFile) {
    appleIconPath = relativePath(entryDir, `${iconsDir}${appleIconFile.fileName}`);
  }

  // 3. Service worker
  onStep?.("sw");
  let swRelHref: string | null = null;
  if (manageServiceWorker) {
    const version = Date.now().toString(36);
    const swPath = analysis.existingServiceWorkerPath && form.replaceServiceWorker ? analysis.existingServiceWorkerPath : `${entryDir}service-worker.js`;
    swRelHref = relativePath(entryDir, swPath);
    put(swPath, enc.encode(generateServiceWorkerSource(version)));
  }

  // 4. HTML integration
  onStep?.("html");
  const entryFile = byPath.get(analysis.entryHtmlPath)!;
  const htmlText = dec.decode(entryFile.bytes);
  const result = injectPwaHtml(htmlText, {
    manifestHref: manifestRelHref || "manifest.json",
    themeColor: form.themeColor,
    appleTouchIconHref: appleIconPath,
    swRegistrationScript: swRelHref ? generateRegistrationSnippet(swRelHref) : null,
    manageManifestTags: manageManifest,
    manageServiceWorker: manageServiceWorker,
  });
  if (result.changed) {
    put(analysis.entryHtmlPath, enc.encode(result.html));
  }

  // 5. Package
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
    unchanged: [],
  };
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
