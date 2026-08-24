"use client";

// Client-side ZIP extraction for Harbor Preview.
//
// This intentionally duplicates a small amount of logic from lib/zip.ts
// (root-folder stripping, ignored dirs, zip-slip guard) because that file
// uses Node's `fs`/`path` and can only run server-side. Preview needs the
// actual file bytes in the browser — client-side-first, nothing gets sent
// to Harbor's server to be executed — so it re-implements the same rules
// against the already-uploaded blob's bytes using `jszip` (already a
// dependency, used by UploadZone for the loose-files case).
//
// This is a browser/mobile-first tool, so extraction also enforces hard
// resource limits (spec: never let a hostile or oversized archive exhaust
// device memory) and rejects any entry whose normalized path would escape
// the virtual project root (zip-slip / path traversal), using the same
// path-normalization rules the detection layer relies on.

import { normalizeEntryPath } from "./pwa/detect/path-security";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".DS_Store"]);

// Resource limits — deliberately conservative for a browser/mobile tab.
export const MAX_ZIP_COMPRESSED_BYTES = 150 * 1024 * 1024; // 150MB archive upload
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 400 * 1024 * 1024; // 400MB decompressed, in aggregate
export const MAX_FILE_COUNT = 20000;
export const MAX_SINGLE_FILE_BYTES = 60 * 1024 * 1024; // 60MB for any one file
// If a single entry claims to inflate more than this multiple of its
// compressed size, treat it as a probable decompression bomb rather than
// trusting the archive's own metadata.
export const MAX_SINGLE_FILE_COMPRESSION_RATIO = 300;

export class ZipLimitError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ZipLimitError";
  }
}

export interface ClientFile {
  /** Relative path with any single wrapping root folder stripped. */
  path: string;
  /** Lowercase extension without the dot, e.g. "html", "" if none. */
  ext: string;
  bytes: Uint8Array;
}

export interface ExtractWarnings {
  skippedUnsafePaths: string[];
  caseCollisions: string[][];
  skippedIgnoredDirs: number;
}

export interface ExtractZipClientResult {
  files: ClientFile[];
  warnings: ExtractWarnings;
}

/**
 * Extracts a ZIP entirely in the browser, enforcing traversal safety and
 * resource limits before trusting any byte of it. Throws ZipLimitError with
 * a stable `code` (safe to show the user / log) if a hard limit is hit —
 * callers should stop processing gracefully rather than let this propagate
 * as an unhandled crash.
 */
export async function extractZipClient(zipBytes: ArrayBuffer): Promise<ClientFile[]> {
  const result = await extractZipClientWithWarnings(zipBytes);
  return result.files;
}

export async function extractZipClientWithWarnings(zipBytes: ArrayBuffer): Promise<ExtractZipClientResult> {
  if (zipBytes.byteLength > MAX_ZIP_COMPRESSED_BYTES) {
    throw new ZipLimitError("zip_too_large", `Archive is ${(zipBytes.byteLength / 1024 / 1024).toFixed(1)}MB, over the ${MAX_ZIP_COMPRESSED_BYTES / 1024 / 1024}MB limit.`);
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipBytes);
  const entries = Object.entries(zip.files);

  const fileEntries = entries.filter(([, e]) => !e.dir);
  if (fileEntries.length > MAX_FILE_COUNT) {
    throw new ZipLimitError("too_many_files", `Archive contains ${fileEntries.length} files, over the ${MAX_FILE_COUNT} limit.`);
  }

  // Root-folder stripping needs normalized names, computed up front so a
  // traversal entry can't influence which prefix we think is "the" root.
  const normalizedNames = new Map<string, string>(); // rawName -> normalized (post zip-slip guard)
  const skippedUnsafePaths: string[] = [];
  for (const [name, entry] of entries) {
    if (entry.dir) continue;
    const norm = normalizeEntryPath(name);
    if (norm === null) {
      skippedUnsafePaths.push(name);
      continue;
    }
    normalizedNames.set(name, norm);
  }

  const survivingNames = [...normalizedNames.values()];
  const topLevelNames = new Set(survivingNames.map((n) => n.split("/")[0]).filter(Boolean));
  const onlyRoot = [...topLevelNames][0];
  const allUnderOneRoot = topLevelNames.size === 1 && survivingNames.every((n) => n.startsWith(onlyRoot + "/") || n === onlyRoot);
  // "Every entry shares one common first segment" is also true of a project
  // that's legitimately just one folder deep at its root (e.g. the whole
  // upload is "lib/" containing nothing else) — structurally identical to a
  // GitHub-style "Download ZIP" wrapper, so that alone isn't enough signal.
  // Only strip when the folder actually looks like a wrapped project root:
  // a recognized root marker sitting directly inside it. Kept in sync with
  // the same check in lib/zip.ts.
  const ROOT_MARKERS = ["package.json", "index.html"];
  const hasWrapperRoot = allUnderOneRoot && ROOT_MARKERS.some((marker) => survivingNames.includes(`${onlyRoot}/${marker}`));
  const rootPrefix = hasWrapperRoot ? `${onlyRoot}/` : "";

  const files: ClientFile[] = [];
  const seenLowerCase = new Map<string, string>();
  const caseCollisions: string[][] = [];
  let skippedIgnoredDirs = 0;
  let totalUncompressed = 0;

  for (const [name, entry] of entries) {
    if (entry.dir) continue;
    const normalized = normalizedNames.get(name);
    if (normalized === undefined) continue; // already recorded as unsafe above

    const relName = normalized.startsWith(rootPrefix) ? normalized.slice(rootPrefix.length) : normalized;
    if (!relName) continue;

    const segments = relName.split("/").filter(Boolean);
    if (segments.some((seg) => IGNORE_DIRS.has(seg))) {
      skippedIgnoredDirs++;
      continue;
    }

    // Best-effort decompression-bomb guard using JSZip's own recorded
    // sizes when available, so we can bail before inflating a hostile
    // entry into memory at all. Falls through safely if the metadata
    // isn't present on this JSZip version.
    const meta = (entry as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
    if (meta?.uncompressedSize != null) {
      if (meta.uncompressedSize > MAX_SINGLE_FILE_BYTES) {
        throw new ZipLimitError("file_too_large", `${relName} is over the ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB single-file limit.`);
      }
      if (meta.compressedSize && meta.compressedSize > 0) {
        const ratio = meta.uncompressedSize / meta.compressedSize;
        if (ratio > MAX_SINGLE_FILE_COMPRESSION_RATIO && meta.uncompressedSize > 5 * 1024 * 1024) {
          throw new ZipLimitError("suspicious_compression_ratio", `${relName} has a ${ratio.toFixed(0)}x compression ratio — treated as a probable decompression bomb.`);
        }
      }
      if (totalUncompressed + meta.uncompressedSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new ZipLimitError("archive_too_large_uncompressed", `Archive would decompress to over ${MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024}MB in total.`);
      }
    }

    const bytes = await entry.async("uint8array");

    // Enforce the same limits post-decompression too, in case size metadata
    // wasn't available up front — never trust the archive's own claims as
    // the only line of defense.
    if (bytes.byteLength > MAX_SINGLE_FILE_BYTES) {
      throw new ZipLimitError("file_too_large", `${relName} is over the ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB single-file limit.`);
    }
    totalUncompressed += bytes.byteLength;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ZipLimitError("archive_too_large_uncompressed", `Archive decompressed to over ${MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024}MB in total.`);
    }

    const dot = relName.lastIndexOf(".");
    const ext = dot >= 0 ? relName.slice(dot + 1).toLowerCase() : "";
    files.push({ path: relName, ext, bytes });

    const lower = relName.toLowerCase();
    const existing = seenLowerCase.get(lower);
    if (existing && existing !== relName) {
      caseCollisions.push([existing, relName]);
    } else {
      seenLowerCase.set(lower, relName);
    }
  }

  return {
    files,
    warnings: { skippedUnsafePaths, caseCollisions, skippedIgnoredDirs },
  };
}
