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

/**
 * Case-insensitively finds whichever existing path (other than the one being
 * dragged) already occupies `candidate`. Case-insensitive for the same
 * reason as the ZIP-extraction collision check (lib/zip.ts) — two paths
 * that only differ by case collide on a real checkout even if they look
 * "different" here.
 */
export function findMoveCollision(candidate: string, draggedPath: string, existingPaths: string[]): string | null {
  const lower = candidate.toLowerCase();
  return existingPaths.find((p) => p !== draggedPath && p.toLowerCase() === lower) ?? null;
}

/** Appends -2, -3, ... to the filename until `candidate` is free. Used for the "rename" side of a move collision. */
export function dedupeMoveTarget(candidate: string, draggedPath: string, targetFolder: string, existingPaths: string[]): string {
  const taken = new Set(existingPaths.filter((p) => p !== draggedPath).map((p) => p.toLowerCase()));
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
