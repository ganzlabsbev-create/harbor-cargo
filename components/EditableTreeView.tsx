"use client";

import { createContext, useContext, useRef } from "react";
import { Folder, File as FileIcon, GripVertical } from "lucide-react";
import { SimpleTreeNode, basename } from "@/lib/tree-utils";
import { useDragTree } from "@/lib/use-drag-tree";
import DragGhost from "./DragGhost";

interface DragCtx {
  draggingPath: string | null;
  hoverFolder: string | null;
  startDrag: (path: string, clientX: number, clientY: number) => void;
}

const DragContext = createContext<DragCtx | null>(null);

/**
 * Root wrapper — owns the single drag session (pointer capture, move/up
 * listeners, auto-scroll, floating ghost — see lib/use-drag-tree.ts) so
 * nested rows just read from context. Root folder ("") is a valid drop
 * target via the outer container itself.
 */
export default function EditableTreeView({
  nodes,
  onMove,
}: {
  nodes: SimpleTreeNode[];
  onMove: (path: string, targetFolder: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { state, startDrag, ghostRef } = useDragTree(onMove);

  return (
    <DragContext.Provider
      value={{
        draggingPath: state.draggingId,
        hoverFolder: state.hoverFolder,
        startDrag: (path, x, y) => startDrag(path, x, y, rootRef.current),
      }}
    >
      <div data-drop-folder="" className="rounded-lg" ref={rootRef}>
        <TreeRows nodes={nodes} pathPrefix="" depth={0} />
      </div>
      {state.draggingId && state.startPointer && (
        <DragGhost ref={ghostRef} x={state.startPointer.x} y={state.startPointer.y} name={basename(state.draggingId)} />
      )}
    </DragContext.Provider>
  );
}

function TreeRows({ nodes, pathPrefix, depth }: { nodes: SimpleTreeNode[]; pathPrefix: string; depth: number }) {
  const ctx = useContext(DragContext)!;
  const { draggingPath, hoverFolder } = ctx;

  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      {nodes.map((n) => {
        const full = pathPrefix ? `${pathPrefix}/${n.name}` : n.name;

        if (n.type === "dir") {
          const isHovered = hoverFolder === full && draggingPath !== null && !draggingPath.startsWith(`${full}/`);
          return (
            <div key={full} data-drop-folder={full}>
              <div
                className={`flex items-center gap-1.5 rounded-md py-1 transition ${
                  isHovered ? "bg-harbor-blue/15 ring-1 ring-harbor-blue" : ""
                }`}
              >
                <Folder size={13} strokeWidth={2} className="shrink-0 text-harbor-blue" />
                <span className="truncate font-mono text-xs text-ink-dim">{n.name}</span>
              </div>
              {n.children && n.children.length > 0 && <TreeRows nodes={n.children} pathPrefix={full} depth={depth + 1} />}
            </div>
          );
        }

        const isDragging = draggingPath === full;
        return (
          <div
            key={full}
            className={`flex items-center gap-1.5 py-1 font-mono text-xs transition ${
              isDragging ? "text-harbor-orange opacity-60" : "text-ink-faint"
            }`}
          >
            <span
              onPointerDown={(e) => {
                e.preventDefault();
                ctx.startDrag(full, e.clientX, e.clientY);
              }}
              className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded p-0.5 text-ink-faint active:cursor-grabbing active:text-harbor-orange"
            >
              <GripVertical size={13} strokeWidth={2} />
            </span>
            <FileIcon size={13} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{n.name}</span>
          </div>
        );
      })}
    </div>
  );
}
