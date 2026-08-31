"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder, FolderOpen, File as FileIcon, Search, X, MoreVertical, FilePlus, PencilLine, Trash2 } from "lucide-react";
import { buildTreeFromPaths, SimpleTreeNode } from "@/lib/tree-utils";
import { fuzzySearchPaths } from "@/lib/fuzzy-match";
import { useLang } from "@/lib/i18n-context";

/**
 * The GitHub Code file tree. Two display modes sharing one input:
 *  - empty query: a real collapsible folder tree (spec: "จะเป็นต้นไม้เหมือนเดิม")
 *  - non-empty query: a flat, fuzzy-ranked result list that updates on
 *    every keystroke (spec: type "folder/folder/file" and the tree keeps
 *    narrowing live)
 *
 * Row height is deliberately roomy (44px+) — build spec's own note that a
 * cramped list is hard to tap on a phone, but capped so a big repo's tree
 * doesn't turn into an endless scroll of oversized rows.
 */

export interface DirtyInfo {
  dirtyPaths: Set<string>;
  addedPaths: Set<string>;
}

export default function RepoFileTree({
  paths,
  activePath,
  onOpen,
  onNewFile,
  onRename,
  onDelete,
  dirty,
}: {
  paths: string[];
  activePath: string | null;
  onOpen: (path: string) => void;
  onNewFile: (folderPath: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  dirty: DirtyInfo;
}) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuPath, setMenuPath] = useState<string | null>(null);

  const tree = useMemo(() => buildTreeFromPaths(paths), [paths]);
  const searching = query.trim().length > 0;
  const matches = useMemo(() => (searching ? fuzzySearchPaths(paths, query) : []), [searching, paths, query]);

  // Lets keyboard users dismiss the per-file rename/delete menu with
  // Escape, same as clicking outside it.
  useEffect(() => {
    if (!menuPath) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuPath(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuPath]);

  function toggle(folderPath: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }

  function rowClass(path: string, isDir: boolean) {
    const isActive = !isDir && path === activePath;
    return `flex min-h-[46px] w-full items-center gap-2 rounded-lg px-2 text-left transition active:bg-base-surface2 active:shadow-glow-orange ${
      isActive ? "bg-harbor-orange/10" : ""
    }`;
  }

  function StatusDot({ path }: { path: string }) {
    if (dirty.addedPaths.has(path)) return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green" title={t("code_status_new")} />;
    if (dirty.dirtyPaths.has(path)) return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-harbor-orange" title={t("code_status_edited")} />;
    return null;
  }

  function FileRow({ path, depth, name }: { path: string; depth: number; name: string }) {
    return (
      <div className="group relative flex items-center">
        <button onClick={() => onOpen(path)} className={rowClass(path, false)} style={{ paddingLeft: 8 + depth * 16 }}>
          <FileIcon size={16} className="shrink-0 text-ink-faint" />
          <span className={`min-w-0 flex-1 truncate text-sm ${path === activePath ? "font-medium text-ink" : "text-ink-dim"}`}>{name}</span>
          <StatusDot path={path} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuPath(menuPath === path ? null : path);
          }}
          className="flex h-[46px] w-9 shrink-0 items-center justify-center text-ink-faint transition active:shadow-glow-orange"
          aria-label={t("code_file_actions")}
        >
          <MoreVertical size={15} />
        </button>
        {menuPath === path && (
          <div role="menu" className="absolute right-9 top-11 z-20 w-40 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
            <button
              role="menuitem"
              onClick={() => {
                setMenuPath(null);
                onRename(path);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink-dim transition active:shadow-glow-orange"
            >
              <PencilLine size={14} /> {t("code_rename")}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenuPath(null);
                onDelete(path);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-accent-red transition active:shadow-glow-orange"
            >
              <Trash2 size={14} /> {t("code_delete")}
            </button>
          </div>
        )}
      </div>
    );
  }

  function DirRow({ node, depth, fullPath }: { node: SimpleTreeNode; depth: number; fullPath: string }) {
    const isOpen = expanded.has(fullPath);
    return (
      <div className="group relative flex items-center">
        <button onClick={() => toggle(fullPath)} className={rowClass(fullPath, true)} style={{ paddingLeft: 8 + depth * 16 }}>
          {isOpen ? <FolderOpen size={16} className="shrink-0 text-harbor-orange" /> : <Folder size={16} className="shrink-0 text-ink-faint" />}
          <span className="min-w-0 flex-1 truncate text-sm text-ink-dim">{node.name}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNewFile(fullPath);
          }}
          className="flex h-[46px] w-9 shrink-0 items-center justify-center text-ink-faint transition active:shadow-glow-orange"
          aria-label={t("code_new_file")}
        >
          <FilePlus size={15} />
        </button>
      </div>
    );
  }

  function renderTree(nodes: SimpleTreeNode[], depth: number, prefix: string) {
    return nodes.map((n) => {
      const fullPath = prefix ? `${prefix}/${n.name}` : n.name;
      if (n.type === "dir") {
        const isOpen = expanded.has(fullPath);
        return (
          <div key={fullPath}>
            <DirRow node={n} depth={depth} fullPath={fullPath} />
            {isOpen && n.children && renderTree(n.children, depth + 1, fullPath)}
          </div>
        );
      }
      return <FileRow key={fullPath} path={fullPath} depth={depth} name={n.name} />;
    });
  }

  return (
    <div className="flex h-full flex-col" onClick={() => setMenuPath(null)}>
      <div className="relative mb-2 shrink-0">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("code_find_file_placeholder")}
          className="w-full rounded-xl border border-base-border bg-base-surface2 py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-ink-faint"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {searching ? (
          matches.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-faint">{t("code_no_matches")}</p>
          ) : (
            matches.map((m) => {
              const name = m.path.split("/").pop() || m.path;
              const dir = m.path.slice(0, m.path.length - name.length - 1);
              return (
                <div key={m.path} className="group relative flex items-center">
                  <button onClick={() => onOpen(m.path)} className={rowClass(m.path, false)}>
                    <FileIcon size={16} className="shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${m.path === activePath ? "font-medium text-ink" : "text-ink-dim"}`}>{name}</span>
                      {dir && <span className="block truncate font-mono text-[11px] text-ink-faint">{dir}</span>}
                    </span>
                    <StatusDot path={m.path} />
                  </button>
                </div>
              );
            })
          )
        ) : (
          renderTree(tree, 0, "")
        )}
      </div>
    </div>
  );
}
