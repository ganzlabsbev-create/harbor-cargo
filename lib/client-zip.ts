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

const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".DS_Store"]);

export interface ClientFile {
  /** Relative path with any single wrapping root folder stripped. */
  path: string;
  /** Lowercase extension without the dot, e.g. "html", "" if none. */
  ext: string;
  bytes: Uint8Array;
}

export async function extractZipClient(zipBytes: ArrayBuffer): Promise<ClientFile[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipBytes);
  const entryNames = Object.keys(zip.files);

  const topLevelNames = new Set(entryNames.map((n) => n.split("/")[0]).filter(Boolean));
  const onlyRoot = [...topLevelNames][0];
  const hasSingleRoot = topLevelNames.size === 1 && entryNames.every((n) => n.startsWith(onlyRoot));
  const rootPrefix = hasSingleRoot ? `${onlyRoot}/` : "";

  const files: ClientFile[] = [];

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;

    const relName = name.startsWith(rootPrefix) ? name.slice(rootPrefix.length) : name;
    if (!relName) continue;

    const segments = relName.split("/").filter(Boolean);
    if (segments.some((seg) => IGNORE_DIRS.has(seg))) continue;
    if (relName.startsWith("/") || segments.includes("..")) continue; // zip-slip guard

    const bytes = await entry.async("uint8array");
    const dot = relName.lastIndexOf(".");
    const ext = dot >= 0 ? relName.slice(dot + 1).toLowerCase() : "";
    files.push({ path: relName, ext, bytes });
  }

  return files;
}
