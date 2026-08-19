"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Folder, File as FileIcon } from "lucide-react";
import type { ClientFile } from "@/lib/client-zip";
import { buildTreeFromPaths, SimpleTreeNode } from "@/lib/tree-utils";

// Broad on purpose — this only gates "decode as UTF-8 text vs. show a binary
// placeholder", not the build/preview pipeline, so it's fine to be more
// permissive here than lib/static-preview.ts's TEXT_EXTS.
const TEXT_EXTS = new Set([
  "html", "htm", "css", "scss", "sass", "less",
  "js", "jsx", "mjs", "cjs", "ts", "tsx",
  "json", "jsonc", "svg", "xml", "txt", "md", "mdx",
  "yml", "yaml", "env", "gitignore", "toml", "vue", "svelte",
]);

const MAX_LINES = 4000;

export interface FileOpenRequest {
  path: string;
  line?: number;
  /** Bump this on every request (even repeats of the same path/line) so a second tap re-triggers the scroll/highlight. */
  nonce: number;
}

function extOf(path: string): string {
  const base = path.split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : base.toLowerCase();
}

export default function FileExplorer({
  files,
  openRequest,
  emptyLabel,
  fileStructureLabel,
  binaryLabel,
  truncatedLabel,
  backLabel,
}: {
  files: ClientFile[];
  /** Set by the parent (e.g. a "file.js:12" tap in Console) to make the explorer jump to that file. */
  openRequest: FileOpenRequest | null;
  emptyLabel: string;
  fileStructureLabel: string;
  binaryLabel: string;
  truncatedLabel: string;
  backLabel: string;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [targetLine, setTargetLine] = useState<number | undefined>(undefined);
  const lineRef = useRef<HTMLDivElement | null>(null);

  const byPath = useMemo(() => {
    const m = new Map<string, ClientFile>();
    for (const f of files) m.set(f.path, f);
    return m;
  }, [files]);

  const tree = useMemo(() => buildTreeFromPaths(files.map((f) => f.path)), [files]);

  useEffect(() => {
    if (!openRequest) return;
    if (!byPath.has(openRequest.path)) return; // console mentioned a path that isn't in this project (e.g. a CDN script) — nothing to open
    setSelectedPath(openRequest.path);
    setTargetLine(openRequest.line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  useEffect(() => {
    if (targetLine && lineRef.current) {
      lineRef.current.scrollIntoView({ block: "center" });
    }
  }, [selectedPath, targetLine]);

  if (files.length === 0) {
    return <p className="px-1 py-2 text-xs text-ink-faint">{emptyLabel}</p>;
  }

  const selectedFile = selectedPath ? byPath.get(selectedPath) : null;

  if (selectedFile) {
    const ext = extOf(selectedFile.path);
    const isText = TEXT_EXTS.has(ext);
    let contentLines: string[] = [];
    if (isText) {
      try {
        contentLines = new TextDecoder().decode(selectedFile.bytes).split("\n");
      } catch {
        contentLines = [];
      }
    }
    const truncated = contentLines.length > MAX_LINES;
    const shownLines = truncated ? contentLines.slice(0, MAX_LINES) : contentLines;

    return (
      <div>
        <button
          onClick={() => {
            setSelectedPath(null);
            setTargetLine(undefined);
          }}
          className="mb-1.5 flex items-center gap-1 px-1 text-xs font-medium text-ink-dim"
        >
          <ChevronLeft size={14} /> {backLabel}
        </button>
        <p className="mb-1 truncate px-1 font-mono text-xs text-ink-faint">{selectedFile.path}</p>
        {isText ? (
          <div className="max-h-[22rem] overflow-auto rounded-lg border border-base-border bg-base-bg">
            <pre className="min-w-max font-mono text-xs">
              {shownLines.map((lineText, i) => {
                const lineNo = i + 1;
                const isTarget = targetLine === lineNo;
                return (
                  <div
                    key={i}
                    ref={isTarget ? lineRef : undefined}
                    className={`flex px-2 ${isTarget ? "bg-harbor-orange/15" : ""}`}
                  >
                    <span className="mr-3 shrink-0 select-none text-right text-ink-faint" style={{ minWidth: "2.5rem" }}>
                      {lineNo}
                    </span>
                    <span className="whitespace-pre text-ink-dim">{lineText || " "}</span>
                  </div>
                );
              })}
              {truncated && <div className="px-2 py-1 text-ink-faint">{truncatedLabel}</div>}
            </pre>
          </div>
        ) : (
          <p className="rounded-lg border border-base-border bg-base-bg p-3 text-xs text-ink-faint">{binaryLabel}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1 px-1 pb-1 text-xs text-ink-faint">
        <Folder size={14} /> {fileStructureLabel}
      </div>
      <FileTreeRows nodes={tree} pathPrefix="" depth={0} onSelect={setSelectedPath} />
    </div>
  );
}

function FileTreeRows({
  nodes,
  pathPrefix,
  depth,
  onSelect,
}: {
  nodes: SimpleTreeNode[];
  pathPrefix: string;
  depth: number;
  onSelect: (path: string) => void;
}) {
  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      {nodes.map((n) => {
        const full = pathPrefix ? `${pathPrefix}/${n.name}` : n.name;
        if (n.type === "dir") {
          return (
            <div key={full}>
              <div className="flex items-center gap-1.5 py-1 font-mono text-xs text-ink-dim">
                <Folder size={13} strokeWidth={2} className="shrink-0 text-harbor-blue" />
                <span className="truncate">{n.name}</span>
              </div>
              {n.children && n.children.length > 0 && (
                <FileTreeRows nodes={n.children} pathPrefix={full} depth={depth + 1} onSelect={onSelect} />
              )}
            </div>
          );
        }
        return (
          <button
            key={full}
            onClick={() => onSelect(full)}
            className="flex w-full items-center gap-1.5 py-1 text-left font-mono text-xs text-ink-dim hover:text-harbor-orange"
          >
            <FileIcon size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
            <span className="truncate">{n.name}</span>
          </button>
        );
      })}
    </div>
  );
}
