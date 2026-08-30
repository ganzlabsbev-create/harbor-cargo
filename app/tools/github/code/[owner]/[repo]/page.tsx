"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Loader2,
  AlertTriangle,
  GitBranch,
  X,
  Save,
  UploadCloud,
  FolderTree,
  FileCode2,
  Search as SearchIcon,
} from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import RepoFileTree, { DirtyInfo } from "@/components/code/RepoFileTree";
import CodeEditor, { CodeEditorHandle } from "@/components/code/CodeEditor";
import CodeSearchPanel from "@/components/code/CodeSearchPanel";
import CommitReviewSheet from "@/components/code/CommitReviewSheet";
import PathPromptSheet from "@/components/code/PathPromptSheet";
import DeleteFileConfirmSheet from "@/components/code/DeleteFileConfirmSheet";
import ProblemsSheet from "@/components/code/ProblemsSheet";
import { useLang } from "@/lib/i18n-context";
import { languageForPath, CodeDiagnostic } from "@/lib/code-lang";
import { saveDraft, loadDraft, clearDraft } from "@/lib/code-draft-store";
import { PendingChange, pendingChangeKey, toCommitPayload } from "@/lib/code-changes";

/**
 * GitHub Code — the editor tool. File tree + search live in
 * app/tools/github/code/[owner]/[repo], one file open in the CodeMirror
 * pane at a time (mobile-first — no split panes), with edits accumulated
 * as PendingChange entries and pushed through the shared /code/commit
 * endpoint either one file at a time or as a batch.
 */

type Section = "files" | "editor" | "search";

interface OpenFileState {
  content: string;
  originalContent: string;
  baseSha: string; // "" for a brand-new, not-yet-committed file
  isBinary: boolean;
}

const localChangeKey = (c: PendingChange): string => (c.kind === "rename" ? c.toPath : c.path);

export default function GithubCodeWorkspace({ params }: { params: { owner: string; repo: string } }) {
  const { t } = useLang();
  const { owner, repo } = params;

  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[] | null>(null);

  const [basePaths, setBasePaths] = useState<string[] | null>(null);
  const [baseShaMap, setBaseShaMap] = useState<Map<string, string>>(new Map());
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);

  const [section, setSection] = useState<Section>("files");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [fileState, setFileState] = useState<Map<string, OpenFileState>>(new Map());
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map());
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [cursorInfo, setCursorInfo] = useState<{ line: number; col: number } | null>(null);
  const [diagnostics, setDiagnostics] = useState<CodeDiagnostic[]>([]);
  const [showProblems, setShowProblems] = useState(false);
  const [pendingJumpLine, setPendingJumpLine] = useState<number | null>(null);

  const [reviewSet, setReviewSet] = useState<PendingChange[] | null>(null); // null = closed
  const [pathPrompt, setPathPrompt] = useState<{ mode: "new" | "rename"; initialPath: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const editorRef = useRef<CodeEditorHandle | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- load repo defaults + branch list -----------------------------------
  useEffect(() => {
    fetch(`/api/github/${owner}/${repo}/settings`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setDefaultBranch(data.settings.default_branch);
          setBranch(data.settings.default_branch);
        }
      })
      .catch(() => {});
    fetch(`/api/github/${owner}/${repo}/branches`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setBranches(data.branches.map((b: any) => b.name));
      })
      .catch(() => {});
  }, [owner, repo]);

  const loadTree = useCallback(async () => {
    if (!branch) return;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/code/tree?branch=${encodeURIComponent(branch)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      const files: { path: string; sha: string }[] = data.files;
      setBasePaths(files.map((f) => f.path));
      setBaseShaMap(new Map(files.map((f) => [f.path, f.sha])));
    } catch (err: any) {
      setTreeError(String(err?.message || err));
    } finally {
      setTreeLoading(false);
    }
  }, [owner, repo, branch]);

  useEffect(() => {
    if (branch) loadTree();
  }, [branch, loadTree]);

  // --- derived display paths (base tree adjusted by pending add/rename/delete) ---
  const displayPaths = useMemo(() => {
    if (!basePaths) return [];
    const set = new Set(basePaths);
    for (const c of pendingChanges.values()) {
      if (c.kind === "add") set.add(c.path);
      else if (c.kind === "delete") set.delete(c.path);
      else if (c.kind === "rename") {
        set.delete(c.fromPath);
        set.add(c.toPath);
      }
    }
    return Array.from(set).sort();
  }, [basePaths, pendingChanges]);

  const dirtyInfo: DirtyInfo = useMemo(() => {
    const dirtyPaths = new Set<string>();
    const addedPaths = new Set<string>();
    for (const c of pendingChanges.values()) {
      if (c.kind === "edit") dirtyPaths.add(c.path);
      else if (c.kind === "add") addedPaths.add(c.path);
      else if (c.kind === "rename") addedPaths.add(c.toPath);
    }
    return { dirtyPaths, addedPaths };
  }, [pendingChanges]);

  const changeCount = pendingChanges.size;

  // --- opening a file ------------------------------------------------------
  async function openFile(path: string, jumpLine?: number) {
    setOpenError(null);
    setSection("editor");

    if (fileState.has(path)) {
      setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
      setActiveTab(path);
      if (jumpLine) setPendingJumpLine(jumpLine);
      return;
    }

    setOpeningPath(path);
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/code/file?path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch!)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      const file = data.file as { content: string; sha: string; isBinary: boolean; size: number };

      if (file.isBinary) {
        setOpenError(t("code_binary_file_notice"));
        setOpeningPath(null);
        return;
      }

      const draft = loadDraft(owner, repo, branch!, path);
      const initialContent = draft && draft.baseSha === file.sha ? draft.content : file.content;

      setFileState((prev) => {
        const next = new Map(prev);
        next.set(path, { content: initialContent, originalContent: file.content, baseSha: file.sha, isBinary: false });
        return next;
      });

      if (initialContent !== file.content) {
        setPendingChanges((prev) => {
          const next = new Map(prev);
          next.set(path, { kind: "edit", path, content: initialContent, originalContent: file.content, baseSha: file.sha });
          return next;
        });
      }

      setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
      setActiveTab(path);
      if (jumpLine) setPendingJumpLine(jumpLine);
    } catch (err: any) {
      setOpenError(String(err?.message || err));
    } finally {
      setOpeningPath(null);
    }
  }

  useEffect(() => {
    if (pendingJumpLine && activeTab && editorRef.current) {
      // Give CodeEditor a tick to remount for the new active path first.
      const id = setTimeout(() => {
        editorRef.current?.scrollToLine(pendingJumpLine);
        setPendingJumpLine(null);
      }, 60);
      return () => clearTimeout(id);
    }
  }, [pendingJumpLine, activeTab]);

  useEffect(() => {
    setDiagnostics([]);
    setCursorInfo(null);
  }, [activeTab]);

  function closeTab(path: string) {
    setOpenTabs((tabs) => {
      const remaining = tabs.filter((p) => p !== path);
      if (activeTab === path) {
        setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1] : null);
      }
      return remaining;
    });
  }

  // --- editing ---------------------------------------------------------------
  function handleChange(path: string, next: string) {
    setFileState((prev) => {
      const map = new Map(prev);
      const entry = map.get(path);
      if (!entry) return prev;
      map.set(path, { ...entry, content: next });
      return map;
    });

    setPendingChanges((prev) => {
      const map = new Map(prev);
      const existingAdd = map.get(path);
      const entry = fileState.get(path);

      if (existingAdd?.kind === "add") {
        map.set(path, { kind: "add", path, content: next });
      } else if (existingAdd?.kind === "rename") {
        map.set(path, { ...existingAdd, content: next });
      } else if (entry) {
        if (next === entry.originalContent) map.delete(path);
        else map.set(path, { kind: "edit", path, content: next, originalContent: entry.originalContent, baseSha: entry.baseSha });
      }
      return map;
    });

    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const entry = fileState.get(path);
      saveDraft(owner, repo, branch!, path, next, entry?.baseSha || "");
    }, 400);
  }

  // --- new file / rename / delete --------------------------------------------
  function submitNewFile(path: string) {
    setPathPrompt(null);
    setPendingChanges((prev) => new Map(prev).set(path, { kind: "add", path, content: "" }));
    setFileState((prev) => new Map(prev).set(path, { content: "", originalContent: "", baseSha: "", isBinary: false }));
    setOpenTabs((tabs) => [...tabs, path]);
    setActiveTab(path);
    setSection("editor");
  }

  function submitRename(oldPath: string, newPath: string) {
    setPathPrompt(null);
    const entry = fileState.get(oldPath);
    const changedContent = entry && entry.content !== entry.originalContent ? entry.content : undefined;
    const baseSha = entry?.baseSha || baseShaMap.get(oldPath) || "";

    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.delete(oldPath);
      next.set(newPath, { kind: "rename", fromPath: oldPath, toPath: newPath, baseSha, content: changedContent });
      return next;
    });

    if (entry) {
      setFileState((prev) => {
        const next = new Map(prev);
        next.delete(oldPath);
        next.set(newPath, entry);
        return next;
      });
    }
    setOpenTabs((tabs) => tabs.map((p) => (p === oldPath ? newPath : p)));
    if (activeTab === oldPath) setActiveTab(newPath);
  }

  function confirmDelete() {
    const path = deleteTarget!;
    setDeleteTarget(null);

    const pending = pendingChanges.get(path);
    if (pending?.kind === "add") {
      // Never existed on GitHub — just forget the local draft, nothing to push.
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
    } else if (pending?.kind === "rename") {
      // Deleting the renamed-to identity really means "undo the rename and
      // delete the original file instead" — the new path never existed on
      // GitHub for there to be anything to delete there.
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(path);
        next.set(pending.fromPath, { kind: "delete", path: pending.fromPath, baseSha: pending.baseSha });
        return next;
      });
    } else {
      const baseSha = fileState.get(path)?.baseSha || baseShaMap.get(path) || "";
      setPendingChanges((prev) => new Map(prev).set(path, { kind: "delete", path, baseSha }));
    }

    setFileState((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    setOpenTabs((tabs) => tabs.filter((p) => p !== path));
    if (activeTab === path) setActiveTab(null);
    clearDraft(owner, repo, branch!, path);
  }

  // --- commit -----------------------------------------------------------------
  async function runCommit(changes: PendingChange[], message: string) {
    const res = await fetch(`/api/github/${owner}/${repo}/code/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, message, changes: toCommitPayload(changes) }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (data.error === "stale_content" && Array.isArray(data.conflicts)) {
        throw new Error(`${t("code_conflict_prefix")} ${data.conflicts.join(", ")}`);
      }
      throw new Error(data.detail || data.error);
    }

    // Clean up local state for everything that just landed on GitHub.
    const committedKeys = new Set(changes.map(localChangeKey));
    setPendingChanges((prev) => {
      const next = new Map(prev);
      for (const k of committedKeys) next.delete(k);
      return next;
    });
    setFileState((prev) => {
      const next = new Map(prev);
      for (const c of changes) {
        if (c.kind === "delete") {
          next.delete(c.path);
        } else if (c.kind === "rename") {
          const entry = next.get(c.toPath);
          if (entry) next.set(c.toPath, { ...entry, originalContent: entry.content });
        } else {
          const key = c.path;
          const entry = next.get(key);
          if (entry) next.set(key, { ...entry, originalContent: entry.content });
        }
      }
      return next;
    });
    for (const c of changes) {
      const key = c.kind === "rename" ? c.toPath : c.kind === "delete" ? c.path : c.path;
      clearDraft(owner, repo, branch!, key);
    }
    setReviewSet(null);
    await loadTree(); // refresh shas so the next save's staleness check is against current state
  }

  // --- render ------------------------------------------------------------------
  const activeEntry = activeTab ? fileState.get(activeTab) : null;
  const activeLang = activeTab ? languageForPath(activeTab) : null;
  const activePendingSelf = activeTab ? pendingChanges.get(activeTab) : undefined;

  return (
    <main className="flex min-h-dvh flex-col bg-base-bg">
      <Header />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-4">
        <Link href="/tools/github/code" className="mb-2 inline-flex w-fit items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <AuthGate next={`/tools/github/code/${owner}/${repo}`}>
          {/* top bar: repo + branch + commit */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold tracking-tight text-ink">{owner}/{repo}</h1>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint">
                <GitBranch size={12} />
                {branches && branch ? (
                  <select
                    value={branch}
                    disabled={changeCount > 0}
                    onChange={(e) => {
                      setBranch(e.target.value);
                      setOpenTabs([]);
                      setActiveTab(null);
                      setFileState(new Map());
                    }}
                    className="bg-transparent text-xs text-ink-faint disabled:opacity-60"
                  >
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{branch || defaultBranch}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setReviewSet(Array.from(pendingChanges.values()))}
              disabled={changeCount === 0}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-harbor-orange px-3 py-2 text-xs font-semibold text-white shadow-glow-orange disabled:opacity-40"
            >
              <UploadCloud size={14} /> {t("code_commit_badge")} {changeCount > 0 ? `(${changeCount})` : ""}
            </button>
          </div>
          {changeCount > 0 && <p className="mb-3 text-xs text-ink-faint">{t("code_branch_locked_hint")}</p>}

          {/* section tabs */}
          <div className="mb-3 flex shrink-0 gap-1 rounded-xl border border-base-border bg-base-surface p-1">
            <SectionTab icon={FolderTree} label={t("code_section_files")} active={section === "files"} onClick={() => setSection("files")} />
            <SectionTab
              icon={FileCode2}
              label={t("code_section_editor")}
              active={section === "editor"}
              onClick={() => setSection("editor")}
              badge={openTabs.length || undefined}
            />
            <SectionTab icon={SearchIcon} label={t("code_section_search")} active={section === "search"} onClick={() => setSection("search")} />
          </div>

          {!branch || !basePaths ? (
            <div className="flex flex-1 items-center justify-center py-16">
              {treeError ? (
                <p className="flex items-center gap-2 text-sm text-accent-red">
                  <AlertTriangle size={16} /> {treeError}
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm text-ink-dim">
                  <Loader2 size={16} className="animate-spin" /> {t("code_loading_repo")}
                </p>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              {section === "files" && (
                <div className="h-[65dvh] rounded-2xl border border-base-border bg-base-surface p-2 shadow-card">
                  <RepoFileTree
                    paths={displayPaths}
                    activePath={activeTab}
                    onOpen={(p) => openFile(p)}
                    onNewFile={(folder) => setPathPrompt({ mode: "new", initialPath: folder ? `${folder}/` : "" })}
                    onRename={(p) => setPathPrompt({ mode: "rename", initialPath: p })}
                    onDelete={(p) => setDeleteTarget(p)}
                    dirty={dirtyInfo}
                  />
                  <button
                    onClick={() => setPathPrompt({ mode: "new", initialPath: "" })}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-base-border py-2 text-xs text-ink-dim"
                  >
                    {t("code_new_file")}
                  </button>
                </div>
              )}

              {section === "editor" && (
                <div className="flex h-[65dvh] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-card">
                  {openTabs.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ink-faint">{t("code_no_open_files")}</div>
                  ) : (
                    <>
                      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-base-border bg-base-surface2 px-1">
                        {openTabs.map((p) => {
                          const name = p.split("/").pop() || p;
                          const dirty = pendingChanges.has(p);
                          return (
                            <button
                              key={p}
                              onClick={() => setActiveTab(p)}
                              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs ${
                                activeTab === p ? "border-harbor-orange text-ink" : "border-transparent text-ink-faint"
                              }`}
                            >
                              {dirty && <span className="h-1.5 w-1.5 rounded-full bg-harbor-orange" />}
                              <span className="max-w-[9rem] truncate">{name}</span>
                              <X
                                size={12}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  closeTab(p);
                                }}
                              />
                            </button>
                          );
                        })}
                      </div>

                      {openError && (
                        <p className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-accent-red/30 bg-accent-red/10 px-2.5 py-2 text-xs text-accent-red">
                          <AlertTriangle size={13} /> {openError}
                        </p>
                      )}

                      <div className="min-h-0 flex-1">
                        {openingPath ? (
                          <div className="flex h-full items-center justify-center text-sm text-ink-dim">
                            <Loader2 size={16} className="mr-2 animate-spin" /> {t("code_loading_file")}
                          </div>
                        ) : activeTab && activeEntry ? (
                          <CodeEditor
                            key={activeTab}
                            ref={editorRef}
                            path={activeTab}
                            value={activeEntry.content}
                            onChange={(next) => handleChange(activeTab, next)}
                            onCursor={setCursorInfo}
                            onDiagnostics={setDiagnostics}
                          />
                        ) : null}
                      </div>

                      {activeTab && (
                        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-base-border bg-base-surface2 px-3 py-1.5 text-[11px] text-ink-faint">
                          <span className="flex items-center">
                            {activeLang?.label} · Ln {cursorInfo?.line ?? 1}, Col {cursorInfo?.col ?? 1}
                            {diagnostics.length > 0 && (
                              <button onClick={() => setShowProblems(true)} className="ml-2 flex items-center gap-1 text-accent-red underline decoration-dotted">
                                {diagnostics.length} {t("code_errors_word")}
                              </button>
                            )}
                          </span>
                          <button
                            onClick={() => activePendingSelf && setReviewSet([activePendingSelf])}
                            disabled={!activePendingSelf}
                            className="flex items-center gap-1 rounded-md bg-harbor-orange/15 px-2 py-1 font-medium text-harbor-orange disabled:opacity-40"
                          >
                            <Save size={12} /> {t("code_save_file")}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {section === "search" && branch && (
                <div className="h-[65dvh] rounded-2xl border border-base-border bg-base-surface p-2 shadow-card">
                  <CodeSearchPanel owner={owner} repo={repo} branch={branch} onOpenAtLine={(p, line) => openFile(p, line)} />
                </div>
              )}
            </div>
          )}
        </AuthGate>
      </div>

      {pathPrompt && (
        <PathPromptSheet
          title={pathPrompt.mode === "new" ? t("code_new_file") : t("code_rename")}
          initialPath={pathPrompt.initialPath}
          existingPaths={new Set(displayPaths)}
          onClose={() => setPathPrompt(null)}
          onSubmit={(p) => (pathPrompt.mode === "new" ? submitNewFile(p) : submitRename(pathPrompt.initialPath, p))}
        />
      )}

      {showProblems && activeTab && (
        <ProblemsSheet
          fileName={activeTab}
          diagnostics={diagnostics}
          onClose={() => setShowProblems(false)}
          onJump={(line) => editorRef.current?.scrollToLine(line)}
        />
      )}

      {deleteTarget && <DeleteFileConfirmSheet path={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}

      {reviewSet && (
        <CommitReviewSheet
          changes={reviewSet}
          defaultMessage={reviewSet.length === 1 ? `Update ${pendingChangeKey(reviewSet[0])} via Harbor` : `Update ${reviewSet.length} files via Harbor`}
          onClose={() => setReviewSet(null)}
          onConfirm={(message) => runCommit(reviewSet, message)}
        />
      )}
    </main>
  );
}

function SectionTab({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${
        active ? "bg-harbor-orange/10 text-harbor-orange" : "text-ink-dim"
      }`}
    >
      <Icon size={14} />
      {label}
      {badge ? <span className="rounded-full bg-base-surface2 px-1.5 text-[10px] text-ink-faint">{badge}</span> : null}
    </button>
  );
}
