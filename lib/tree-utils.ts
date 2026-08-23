export interface SimpleTreeNode {
  name: string;
  type: "file" | "dir";
  children?: SimpleTreeNode[];
}

/** Walks a nested tree (as returned by /api/upload) and returns every file's full path. */
export function flattenFiles(nodes: SimpleTreeNode[], prefix = ""): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const full = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === "file") {
      out.push(full);
    } else if (n.children) {
      out.push(...flattenFiles(n.children, full));
    }
  }
  return out;
}

/** Rebuilds a nested tree from a flat list of file paths — folders first, alphabetical, mirrors the server's extraction order. */
export function buildTreeFromPaths(paths: string[]): SimpleTreeNode[] {
  const root: SimpleTreeNode[] = [];

  for (const full of paths) {
    const segments = full.split("/").filter(Boolean);
    let level = root;
    segments.forEach((seg, idx) => {
      const isFile = idx === segments.length - 1;
      let node = level.find((n) => n.name === seg && n.type === (isFile ? "file" : "dir"));
      if (!node) {
        node = isFile ? { name: seg, type: "file" } : { name: seg, type: "dir", children: [] };
        level.push(node);
      }
      if (!isFile) level = node.children!;
    });
  }

  sortTree(root);
  return root;
}

function sortTree(nodes: SimpleTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  nodes.forEach((n) => n.children && sortTree(n.children));
}

/** Same traversal, but only returns folder paths (root included as ""). Used as the set of valid drop targets. */
export function listFolderPaths(nodes: SimpleTreeNode[], prefix = ""): string[] {
  const out = [prefix];
  for (const n of nodes) {
    if (n.type === "dir") {
      const full = prefix ? `${prefix}/${n.name}` : n.name;
      out.push(...listFolderPaths(n.children || [], full));
    }
  }
  return out;
}

/** Like listFolderPaths, but for any tree of nodes that already carry their own full path (e.g. DiffTreeNode from components/DiffTreeView) rather than needing one built up from `name` + prefix. Root is not included since these trees have no root entry. */
export function listFolderFullPaths(nodes: { type: "dir" | "file"; fullPath: string; children?: any[] }[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === "dir") {
      out.push(n.fullPath);
      if (n.children) out.push(...listFolderFullPaths(n.children));
    }
  }
  return out;
}

export function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

/**
 * Computes the plain target path for a drag-move — just "what folder + what
 * filename", no collision handling. Callers check for a collision separately
 * (see findMoveCollision) before deciding whether to apply this as-is or
 * hand it to the user for a replace/rename choice.
 */
export function computeMoveTarget(draggedPath: string, targetFolder: string): string {
  const name = basename(draggedPath);
  return targetFolder ? `${targetFolder}/${name}` : name;
}

export interface MoveCollision {
  /** The existing path that occupies `candidate`. */
  path: string;
  /** Whether the thing in the way is a file (can be replaced or renamed around) or a folder (can only be renamed around — a folder can't be replaced by a dropped file). */
  kind: "file" | "folder";
}

/**
 * Case-insensitively finds whichever existing path (other than the one being
 * dragged) already occupies `candidate` — checking both file paths and
 * folder paths. Case-insensitive for the same reason as the ZIP-extraction
 * collision check (lib/zip.ts) — two paths that only differ by case collide
 * on a real checkout even if they look "different" here.
 *
 * Folder paths must be checked too: dropping a file at a path that matches
 * an existing *folder* (e.g. a file named "config" landing where a "config/"
 * directory already sits) doesn't collide with any single file path, but it
 * still produces an invalid tree — the same path can't be both a blob and a
 * tree in the same commit. GitHub's Git Data API rejects that outright.
 */
export function findMoveCollision(
  candidate: string,
  draggedPath: string,
  existingPaths: string[],
  folderPaths: string[] = []
): MoveCollision | null {
  const lower = candidate.toLowerCase();
  const filePath = existingPaths.find((p) => p !== draggedPath && p.toLowerCase() === lower);
  if (filePath) return { path: filePath, kind: "file" };
  const folderPath = folderPaths.find((p) => p && p.toLowerCase() === lower);
  if (folderPath) return { path: folderPath, kind: "folder" };
  return null;
}

/** Appends -2, -3, ... to the filename until `candidate` is free of both file and folder paths. Used for the "rename" side of a move collision. */
export function dedupeMoveTarget(
  candidate: string,
  draggedPath: string,
  targetFolder: string,
  existingPaths: string[],
  folderPaths: string[] = []
): string {
  const taken = new Set([
    ...existingPaths.filter((p) => p !== draggedPath).map((p) => p.toLowerCase()),
    ...folderPaths.filter(Boolean).map((p) => p.toLowerCase()),
  ]);
  if (!taken.has(candidate.toLowerCase())) return candidate;

  const name = basename(candidate);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  let result = candidate;
  while (taken.has(result.toLowerCase())) {
    const deduped = `${stem}-${i}${ext}`;
    result = targetFolder ? `${targetFolder}/${deduped}` : deduped;
    i++;
  }
  return result;
}
