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
 * Computes where a dragged file should land, deduping against paths already
 * in use. Collisions are checked case-insensitively (not just exact match) —
 * two paths that only differ by case are the same file on a macOS/Windows
 * checkout, so treating them as distinct would silently produce a repo that
 * looks fine here but breaks on those systems (same class of problem as the
 * case-collision warning surfaced during ZIP extraction, see lib/zip.ts).
 */
export function resolveMoveTarget(draggedPath: string, targetFolder: string, existingPaths: string[]): string {
  const name = basename(draggedPath);
  let candidate = targetFolder ? `${targetFolder}/${name}` : name;
  if (candidate === draggedPath) return candidate;

  const taken = new Set(existingPaths.filter((p) => p !== draggedPath).map((p) => p.toLowerCase()));
  if (!taken.has(candidate.toLowerCase())) return candidate;

  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (taken.has(candidate.toLowerCase())) {
    const deduped = `${stem}-${i}${ext}`;
    candidate = targetFolder ? `${targetFolder}/${deduped}` : deduped;
    i++;
  }
  return candidate;
}
