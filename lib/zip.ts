import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".DS_Store"]);

// GitHub's own Git Data API rejects blobs over 100MB. Warn well before that
// (base64 encoding also inflates the upload ~33%) so push doesn't fail
// midway through a multi-file commit.
const OVERSIZED_FILE_BYTES = 90 * 1024 * 1024;

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

  // ถ้า ZIP มี root folder เดียวหุ้มทุกอย่าง (พบบ่อยจากการกด "Download ZIP" ของ GitHub)
  // ให้ strip root นั้นออก เพื่อให้ package.json ไปอยู่ level บนสุด
  const topLevelNames = new Set(
    entries.map((e) => e.entryName.split("/")[0]).filter(Boolean)
  );
  const hasSingleRoot =
    topLevelNames.size === 1 && entries.every((e) => e.entryName.startsWith([...topLevelNames][0]));
  const rootPrefix = hasSingleRoot ? `${[...topLevelNames][0]}/` : "";

  let fileCount = 0;
  const oversizedFiles: string[] = [];
  const skippedUnsafePaths: string[] = [];
  const seenLowerCase = new Map<string, string>();
  const caseCollisions: string[][] = [];

  for (const entry of entries) {
    const relName = entry.entryName.startsWith(rootPrefix)
      ? entry.entryName.slice(rootPrefix.length)
      : entry.entryName;
    if (!relName) continue;

    const segments = relName.split("/").filter(Boolean);
    if (segments.some((seg) => IGNORE_DIRS.has(seg))) continue;

    // Reject path traversal / absolute-path entries outright rather than
    // letting them write outside extractDir.
    if (relName.startsWith("/") || segments.includes("..")) {
      skippedUnsafePaths.push(relName);
      continue;
    }

    const destPath = path.join(extractDir, ...segments);
    if (!destPath.startsWith(path.normalize(extractDir))) {
      skippedUnsafePaths.push(relName);
      continue;
    }

    if (entry.isDirectory) {
      fs.mkdirSync(destPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const data = entry.getData();
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
