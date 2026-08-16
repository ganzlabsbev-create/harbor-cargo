"use client";

import { createContext, useContext, useRef } from "react";
import { Folder, File as FileIcon, GripVertical, Lock } from "lucide-react";
import CircleCheckbox from "./CircleCheckbox";
import { basename } from "@/lib/tree-utils";
import { useDragTree } from "@/lib/use-drag-tree";
import DragGhost from "./DragGhost";

export type DiffStatus = "modified" | "add" | "unchanged";

export interface DiffTreeNode {
  name: string;
  /** Current (possibly dragged-to) path — used for display and as the tree position. */
  fullPath: string;
  /** Stable identity from the original diff (/api/diff) — status and selection are always keyed by this, independent of where the file currently sits after a drag. Folders use their current path as origPath since they have no diff identity of their own. */
  origPath: string;
  type: "dir" | "file";
  status?: DiffStatus;
  children?: DiffTreeNode[];
}

/** Merges the 3 diff categories (modified/zipOnly/repoOnly) into one sorted tree, folders first. */
export function buildDiffTree(items: { origPath: string; path: string; status: DiffStatus }[]): DiffTreeNode[] {
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
          ? { name: seg, fullPath: acc, origPath: item.origPath, type: "file", status: item.status }
          : { name: seg, fullPath: acc, origPath: acc, type: "dir", children: [] };
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

interface DragCtx {
  draggingOrigPath: string | null;
  hoverFolder: string | null;
  startDrag: (origPath: string, clientX: number, clientY: number) => void;
}

const DragContext = createContext<DragCtx | null>(null);

/**
 * File tree with per-file selection for the "update existing repo" flow,
 * plus drag-to-move-into-folder (same pointer-capture pattern as
 * EditableTreeView, via the shared useDragTree hook — see
 * lib/use-drag-tree.ts — adapted so drag identity follows origPath — a
 * file's add/replace/delete status must survive being dragged to a new spot).
 * - orange = modified (in both zip and repo) — checking it means "replace"
 * - green  = add (only in zip) — checking it means "add to repo"
 * - gray → red strikethrough = unchanged (only in repo) — checking it marks it for deletion
 * Folders are display-only (no checkbox, not draggable), shown in harbor-blue.
 * Files marked for deletion are locked (grip replaced with a lock icon) since
 * a file about to be removed from the repo shouldn't be relocated instead.
 */
export default function DiffTreeView({
  nodes,
  selectedReplace,
  selectedAdd,
  selectedDelete,
  onToggleReplace,
  onToggleAdd,
  onToggleDelete,
  onMove,
}: {
  nodes: DiffTreeNode[];
  selectedReplace: Set<string>;
  selectedAdd: Set<string>;
  selectedDelete: Set<string>;
  onToggleReplace: (origPath: string) => void;
  onToggleAdd: (origPath: string) => void;
  onToggleDelete: (origPath: string) => void;
  onMove: (origPath: string, targetFolder: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { state, startDrag } = useDragTree(onMove);

  return (
    <DragContext.Provider
      value={{
        draggingOrigPath: state.draggingId,
        hoverFolder: state.hoverFolder,
        startDrag: (origPath, x, y) => startDrag(origPath, x, y, rootRef.current),
      }}
    >
      <div data-drop-folder="" ref={rootRef}>
        <DiffTreeRows
          nodes={nodes}
          depth={0}
          selectedReplace={selectedReplace}
          selectedAdd={selectedAdd}
          selectedDelete={selectedDelete}
          onToggleReplace={onToggleReplace}
          onToggleAdd={onToggleAdd}
          onToggleDelete={onToggleDelete}
        />
      </div>
      {state.draggingId && state.pointer && (
        <DragGhost x={state.pointer.x} y={state.pointer.y} name={basename(state.draggingId)} />
      )}
    </DragContext.Provider>
  );
}

function DiffTreeRows({
  nodes,
  depth,
  selectedReplace,
  selectedAdd,
  selectedDelete,
  onToggleReplace,
  onToggleAdd,
  onToggleDelete,
}: {
  nodes: DiffTreeNode[];
  depth: number;
  selectedReplace: Set<string>;
  selectedAdd: Set<string>;
  selectedDelete: Set<string>;
  onToggleReplace: (origPath: string) => void;
  onToggleAdd: (origPath: string) => void;
  onToggleDelete: (origPath: string) => void;
}) {
  const ctx = useContext(DragContext)!;
  const { draggingOrigPath, hoverFolder } = ctx;

  return (
    <div style={{ paddingLeft: depth ? 16 : 0 }}>
      {nodes.map((n) => {
        if (n.type === "dir") {
          const isHovered = hoverFolder === n.fullPath && draggingOrigPath !== null;
          return (
            <div key={n.fullPath} data-drop-folder={n.fullPath}>
              <div
                className={`flex items-center gap-2 rounded-md py-2 transition ${
                  isHovered ? "bg-harbor-blue/15 ring-1 ring-harbor-blue" : ""
                }`}
              >
                <Folder size={16} strokeWidth={2} className="shrink-0 text-harbor-blue" />
                <span className="truncate font-mono text-sm font-medium text-harbor-blue">{n.name}</span>
              </div>
              {n.children && n.children.length > 0 && (
                <DiffTreeRows
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

        const isMarkedDelete = n.status === "unchanged" && selectedDelete.has(n.origPath);
        const checked =
          n.status === "modified"
            ? selectedReplace.has(n.origPath)
            : n.status === "add"
              ? selectedAdd.has(n.origPath)
              : selectedDelete.has(n.origPath);

        const colorClass =
          n.status === "modified"
            ? "text-harbor-orange"
            : n.status === "add"
              ? "text-accent-green"
              : isMarkedDelete
                ? "text-accent-red line-through"
                : "text-ink-dim";

        const circleColor = n.status === "modified" ? "orange" : n.status === "add" ? "green" : "red";
        const locked = isMarkedDelete;
        const isDragging = draggingOrigPath === n.origPath;

        function handleToggle() {
          if (n.status === "modified") onToggleReplace(n.origPath);
          else if (n.status === "add") onToggleAdd(n.origPath);
          else onToggleDelete(n.origPath);
        }

        return (
          <div
            key={n.origPath}
            className={`flex items-center gap-1.5 rounded-lg py-2 pl-1 pr-2 transition ${
              isMarkedDelete ? "bg-accent-red/5" : checked ? "bg-base-surface2" : "hover:bg-base-surface2/50"
            } ${isDragging ? "opacity-50" : ""}`}
          >
            <span
              onPointerDown={
                locked
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      ctx.startDrag(n.origPath, e.clientX, e.clientY);
                    }
              }
              className={`flex shrink-0 items-center justify-center rounded p-0.5 ${
                locked
                  ? "cursor-not-allowed text-ink-faint/40"
                  : "cursor-grab touch-none text-ink-faint active:cursor-grabbing active:text-harbor-orange"
              }`}
            >
              {locked ? <Lock size={13} strokeWidth={2} /> : <GripVertical size={13} strokeWidth={2} />}
            </span>
            <div onClick={handleToggle} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <FileIcon size={16} strokeWidth={2} className={`shrink-0 ${colorClass}`} />
              <span className={`min-w-0 flex-1 truncate font-mono text-sm ${colorClass}`}>{n.name}</span>
            </div>
            <CircleCheckbox checked={checked} onChange={handleToggle} color={circleColor} />
          </div>
        );
      })}
    </div>
  );
}
