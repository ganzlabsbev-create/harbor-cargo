import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import { normalizeEntryPath } from "./pwa/detect/path-security";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".DS_Store"]);

// GitHub's own Git Data API rejects blobs over 100MB. Warn well before that
// (base64 encoding also inflates the upload ~33%) so push doesn't fail
// midway through a multi-file commit.
const OVERSIZED_FILE_BYTES = 90 * 1024 * 1024;

// Hard resource limits (spec: never let a hostile archive exhaust memory/disk).
const MAX_FILE_COUNT = 20000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 400 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 60 * 1024 * 1024;

export class ZipLimitError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ZipLimitError";
  }
}

export interface TreeNode {
  name: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

export interface ZipWarnings {
  /** Files that are likely to be rejected by GitHub's blob API (>90MB). */
  oversizedFiles: string[];
  /** Paths that only differ by case — risky on macOS/Windows checkouts. */
  caseCollisions: string[][];
  /** Entries skipped because they tried to write outside the project (zip-slip). */
  skippedUnsafePaths: string[];
}

export interface ExtractedProject {
  extractDir: string;
  tree: TreeNode[];
  fileCount: number;
  packageJson: any | null;
  warnings: ZipWarnings;
}

/**
 * แตกไฟล์ ZIP ลง temp dir แล้ว build โครงสร้างไฟล์แบบ tree
 * กรอง node_modules/.git ทิ้งอัตโนมัติ (กันโปรเจกต์ใหญ่เกินจำเป็นและลดขนาดที่จะส่งต่อ)
 *
 * Also validates as it goes: rejects entries that try to write outside
 * extractDir (zip-slip), and flags files that are oversized or collide by
 * case-insensitive path — these come back as `warnings` instead of failing
 * outright, since the caller decides whether they're fatal.
 */
export function extractZip(zipBuffer: Buffer, extractDir: string): ExtractedProject {
  fs.mkdirSync(extractDir, { recursive: true });

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  if (entries.length > MAX_FILE_COUNT) {
    throw new ZipLimitError("too_many_files", `Archive contains ${entries.length} files, over the ${MAX_FILE_COUNT} limit.`);
  }

  // Normalize every entry name up front through the same path-security rules
  // used by the client-side extractor (zip-slip, absolute paths, drive
  // letters, null bytes, all-dots segments) — adm-zip's own entryName is
  // untrusted input from the archive, not something to build fs paths from
  // directly.
  const normalizedNames = new Map<string, string>();
  const skippedUnsafePathsPre: string[] = [];
  for (const entry of entries) {
    const norm = normalizeEntryPath(entry.entryName);
    if (norm === null) {
      skippedUnsafePathsPre.push(entry.entryName);
      continue;
    }
    normalizedNames.set(entry.entryName, norm);
  }

  // ถ้า ZIP มี root folder เดียวหุ้มทุกอย่าง (พบบ่อยจากการกด "Download ZIP" ของ GitHub)
  // ให้ strip root นั้นออก เพื่อให้ package.json ไปอยู่ level บนสุด
  const survivingNames = [...normalizedNames.values()];
  const topLevelNames = new Set(survivingNames.map((n) => n.split("/")[0]).filter(Boolean));
  const onlyRoot = [...topLevelNames][0];
  const allUnderOneRoot = topLevelNames.size === 1 && survivingNames.every((n) => n.startsWith(`${onlyRoot}/`) || n === onlyRoot);
  // "Every entry shares one common first segment" is also true of a project
  // that's legitimately just one folder deep at its root (e.g. the whole
  // upload is "lib/" containing nothing else) — structurally identical to a
  // GitHub-style wrapper, so that alone isn't enough signal. Only strip when
  // the folder actually looks like a wrapped project root: a recognized
  // root marker sitting directly inside it. Without this, a real folder
  // like "lib/" was getting silently unwrapped and dropped from every path
  // instead of preserved — a single "lib/github.ts" entry became
  // "github.ts" at the true root.
  const ROOT_MARKERS = ["package.json", "index.html"];
  const hasWrapperRoot = allUnderOneRoot && ROOT_MARKERS.some((marker) => survivingNames.includes(`${onlyRoot}/${marker}`));
  const rootPrefix = hasWrapperRoot ? `${onlyRoot}/` : "";

  let fileCount = 0;
  let totalUncompressed = 0;
  const oversizedFiles: string[] = [];
  const skippedUnsafePaths: string[] = [...skippedUnsafePathsPre];
  const seenLowerCase = new Map<string, string>();
  const caseCollisions: string[][] = [];

  for (const entry of entries) {
    const normalized = normalizedNames.get(entry.entryName);
    if (normalized === undefined) continue; // already recorded as unsafe above

    const relName = normalized.startsWith(rootPrefix) ? normalized.slice(rootPrefix.length) : normalized;
    if (!relName) continue;

    const segments = relName.split("/").filter(Boolean);
    if (segments.some((seg) => IGNORE_DIRS.has(seg))) continue;

    const destPath = path.join(extractDir, ...segments);
    if (!destPath.startsWith(path.normalize(extractDir))) {
      // Defense in depth: even after normalizeEntryPath, confirm the final
      // joined fs path still resolves under extractDir before writing.
      skippedUnsafePaths.push(relName);
      continue;
    }

    if (entry.isDirectory) {
      fs.mkdirSync(destPath, { recursive: true });
    } else {
      const data = entry.getData();

      if (data.length > MAX_SINGLE_FILE_BYTES) {
        throw new ZipLimitError("file_too_large", `${relName} is over the ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB single-file limit.`);
      }
      totalUncompressed += data.length;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new ZipLimitError("archive_too_large_uncompressed", `Archive decompressed to over ${MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024}MB in total.`);
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, data);
      fileCount++;

      if (data.length > OVERSIZED_FILE_BYTES) {
        oversizedFiles.push(relName);
      }

      const lower = relName.toLowerCase();
      const existing = seenLowerCase.get(lower);
      if (existing && existing !== relName) {
        caseCollisions.push([existing, relName]);
      } else {
        seenLowerCase.set(lower, relName);
      }
    }
  }

  const tree = buildTree(extractDir);

  let packageJson: any | null = null;
  const pkgPath = path.join(extractDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch {
      packageJson = null;
    }
  }

  return {
    extractDir,
    tree,
    fileCount,
    packageJson,
    warnings: { oversizedFiles, caseCollisions, skippedUnsafePaths },
  };
}

function buildTree(dir: string): TreeNode[] {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const item of items) {
    if (IGNORE_DIRS.has(item.name)) continue;
    if (item.isDirectory()) {
      nodes.push({
        name: item.name,
        type: "dir",
        children: buildTree(path.join(dir, item.name)),
      });
    } else {
      nodes.push({ name: item.name, type: "file" });
    }
  }

  // โฟลเดอร์ก่อน ไฟล์ทีหลัง เรียงตามชื่อ
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** เก็บรายชื่อไฟล์ทั้งหมดแบบ flat path (relative) ไว้ส่งต่อให้ Vercel/GitHub API */
export function listAllFiles(extractDir: string): string[] {
  const result: string[] = [];
  function walk(dir: string, prefix: string) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(item.name)) continue;
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        walk(path.join(dir, item.name), rel);
      } else {
        result.push(rel);
      }
    }
  }
  walk(extractDir, "");
  return result;
}
