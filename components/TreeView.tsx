"use client";

import { Folder, File as FileIcon } from "lucide-react";

export interface TreeNode {
  name: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

/** Plain read-only file tree — used to preview a ZIP's contents before pushing. */
export default function TreeView({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      {nodes.map((n, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5 py-1 font-mono text-xs text-ink-dim">
            {n.type === "dir" ? (
              <Folder size={13} strokeWidth={2} className="shrink-0 text-harbor-blue" />
            ) : (
              <FileIcon size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
            )}
            <span className="truncate">{n.name}</span>
          </div>
          {n.children && n.children.length > 0 && <TreeView nodes={n.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}
