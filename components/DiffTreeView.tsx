"use client";

import { Folder, File as FileIcon } from "lucide-react";
import CircleCheckbox from "./CircleCheckbox";

export type DiffStatus = "modified" | "add" | "unchanged";

export interface DiffTreeNode {
  name: string;
  fullPath: string;
  type: "dir" | "file";
  status?: DiffStatus;
  children?: DiffTreeNode[];
}

/** Merges the 3 diff categories (modified/zipOnly/repoOnly) into one sorted tree, folders first. */
export function buildDiffTree(items: { path: string; status: DiffStatus }[]): DiffTreeNode[] {
  const root: DiffTreeNode[] = [];

  for (const item of items) {
    const segments = item.path.split("/").filter(Boolean);
    let level = root;
    let acc = "";

    segments.forEach((seg, idx) => {
      acc = acc ? `${acc}/${seg}` : seg;
      const isFile = idx === segments.length - 1;
      let node = level.find((n) => n.name === seg && n.type === (isFile ? "file" : "dir"));
      if (!node) {
        node = isFile
          ? { name: seg, fullPath: acc, type: "file", status: item.status }
          : { name: seg, fullPath: acc, type: "dir", children: [] };
        level.push(node);
      }
      if (!isFile) level = node.children!;
    });
  }

  sortDiffTree(root);
  return root;
}

function sortDiffTree(nodes: DiffTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  nodes.forEach((n) => n.children && sortDiffTree(n.children));
}

/**
 * File tree with per-file selection for the "update existing repo" flow.
 * - orange = modified (in both zip and repo) — checking it means "replace"
 * - blue   = add (only in zip) — checking it means "add to repo"
 * - gray → red strikethrough = unchanged (only in repo) — checking it marks it for deletion
 * Folders are display-only (no checkbox), shown in harbor-blue.
 */
export default function DiffTreeView({
  nodes,
  depth = 0,
  selectedReplace,
  selectedAdd,
  selectedDelete,
  onToggleReplace,
  onToggleAdd,
  onToggleDelete,
}: {
  nodes: DiffTreeNode[];
  depth?: number;
  selectedReplace: Set<string>;
  selectedAdd: Set<string>;
  selectedDelete: Set<string>;
  onToggleReplace: (path: string) => void;
  onToggleAdd: (path: string) => void;
  onToggleDelete: (path: string) => void;
}) {
  return (
    <div style={{ paddingLeft: depth ? 16 : 0 }}>
      {nodes.map((n) => {
        if (n.type === "dir") {
          return (
            <div key={n.fullPath}>
              <div className="flex items-center gap-2 py-2">
                <Folder size={16} strokeWidth={2} className="shrink-0 text-harbor-blue" />
                <span className="truncate font-mono text-sm font-medium text-harbor-blue">{n.name}</span>
              </div>
              {n.children && n.children.length > 0 && (
                <DiffTreeView
                  nodes={n.children}
                  depth={depth + 1}
                  selectedReplace={selectedReplace}
                  selectedAdd={selectedAdd}
                  selectedDelete={selectedDelete}
                  onToggleReplace={onToggleReplace}
                  onToggleAdd={onToggleAdd}
                  onToggleDelete={onToggleDelete}
                />
              )}
            </div>
          );
        }

        const isMarkedDelete = n.status === "unchanged" && selectedDelete.has(n.fullPath);
        const checked =
          n.status === "modified"
            ? selectedReplace.has(n.fullPath)
            : n.status === "add"
              ? selectedAdd.has(n.fullPath)
              : selectedDelete.has(n.fullPath);

        const colorClass =
          n.status === "modified"
            ? "text-harbor-orange"
            : n.status === "add"
              ? "text-accent-green"
              : isMarkedDelete
                ? "text-accent-red line-through"
                : "text-ink-dim";

        const circleColor = n.status === "modified" ? "orange" : n.status === "add" ? "green" : "red";

        function handleToggle() {
          if (n.status === "modified") onToggleReplace(n.fullPath);
          else if (n.status === "add") onToggleAdd(n.fullPath);
          else onToggleDelete(n.fullPath);
        }

        return (
          <div
            key={n.fullPath}
            onClick={handleToggle}
            className={`flex cursor-pointer items-center gap-2 rounded-lg py-2.5 pl-1 pr-2 transition ${
              isMarkedDelete ? "bg-accent-red/5" : checked ? "bg-base-surface2" : "hover:bg-base-surface2/50"
            }`}
          >
            <FileIcon size={16} strokeWidth={2} className={`shrink-0 ${colorClass}`} />
            <span className={`min-w-0 flex-1 truncate font-mono text-sm ${colorClass}`}>{n.name}</span>
            <CircleCheckbox checked={checked} onChange={handleToggle} color={circleColor} />
          </div>
        );
      })}
    </div>
  );
}
