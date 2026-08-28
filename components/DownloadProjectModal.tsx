"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import CircleCheckbox from "./CircleCheckbox";
import { useLang } from "@/lib/i18n-context";

/**
 * Download Project (build spec sections 9-13). A bottom sheet, not a new
 * page — same shell as ConfirmMoveDialog.tsx — since this is a small,
 * one-off action attached to a repo the user already has open, not a
 * standalone flow.
 */

type Stage = "idle" | "preparing" | "fetching" | "zipping" | "uploading" | "done" | "error" | "cancelled";

interface Branch {
  name: string;
  protected: boolean;
}

export default function DownloadProjectModal({
  owner,
  repo,
  defaultBranch,
  onClose,
}: {
  owner: string;
  repo: string;
  defaultBranch: string;
  onClose: () => void;
}) {
  const { t } = useLang();

  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branch, setBranch] = useState(defaultBranch);
  const [source, setSource] = useState<"current" | "another">("current");

  const [contents, setContents] = useState<"repo" | "folder">("repo");
  const [folderPath, setFolderPath] = useState("");

  const [includeHidden, setIncludeHidden] = useState(true);
  const [includeGithub, setIncludeGithub] = useState(true);

  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<{ current: number; total: number; currentFile?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(`/api/github/${owner}/${repo}/branches`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setBranches(data.branches);
      })
      .catch(() => {});
  }, [owner, repo]);

  function cancel() {
    abortRef.current?.abort();
    setStage("cancelled");
  }

  async function startDownload() {
    setError(null);
    setStage("preparing");
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/github/${owner}/${repo}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: source === "current" ? defaultBranch : branch,
          scope: contents,
          folderPath: contents === "folder" ? folderPath.trim() : undefined,
          includeHidden,
          includeGithub,
        }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("no_response_body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "status") {
            setStage(evt.stage);
          } else if (evt.type === "progress") {
            setStage("fetching");
            setProgress({ current: evt.current, total: evt.total, currentFile: evt.currentFile });
          } else if (evt.type === "done") {
            if (!evt.ok) {
              setStage("error");
              setError(evt.detail || t("download_failed"));
              return;
            }
            setStage("done");
            setResultFilename(evt.filename);
            triggerBrowserDownload(evt.blobUrl, evt.filename, evt.blobPathname);
          }
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setStage("error");
      setError(String(err?.message || err));
    }
  }

  async function triggerBrowserDownload(blobUrl: string, filename: string, blobPathname: string) {
    try {
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      // The ZIP only ever needs to live in Blob storage long enough for
      // this fetch — clean it up the same way an abandoned upload blob
      // gets cleaned up (see lib/use-blob-cleanup.ts).
      fetch("/api/upload/blob-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: blobPathname }),
      }).catch(() => {});
    }
  }

  const busy = stage === "preparing" || stage === "fetching" || stage === "zipping" || stage === "uploading";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={busy ? undefined : onClose}>
      <div
        className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-base-border bg-base-surface p-4 pb-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">{t("download_project_title")}</h2>
          {!busy && (
            <button onClick={onClose} className="text-ink-faint">
              <X size={20} />
            </button>
          )}
        </div>

        {stage === "idle" || stage === "error" || stage === "cancelled" ? (
          <>
            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-accent-red/30 bg-accent-red/10 p-3 text-sm text-accent-red">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}

            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{t("download_source")}</p>
              <div className="flex flex-col gap-2">
                <RadioRow label={`${t("download_current_branch")} (${defaultBranch})`} active={source === "current"} onClick={() => setSource("current")} />
                <RadioRow label={t("download_another_branch")} active={source === "another"} onClick={() => setSource("another")} />
                {source === "another" && (
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="ml-8 rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink"
                  >
                    {(branches || [{ name: defaultBranch, protected: false }]).map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </section>

            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{t("download_contents")}</p>
              <div className="flex flex-col gap-2">
                <RadioRow label={t("download_entire_repo")} active={contents === "repo"} onClick={() => setContents("repo")} />
                <RadioRow label={t("download_selected_folder")} active={contents === "folder"} onClick={() => setContents("folder")} />
                {contents === "folder" && (
                  <input
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder={t("download_folder_placeholder")}
                    className="ml-8 rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
                  />
                )}
              </div>
            </section>

            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{t("download_options")}</p>
              <div className="flex flex-col gap-2">
                <CheckRow label={t("download_include_hidden")} checked={includeHidden} onChange={() => setIncludeHidden((v) => !v)} />
                <CheckRow label={t("download_include_github")} checked={includeGithub} onChange={() => setIncludeGithub((v) => !v)} />
                <CheckRow label={t("download_include_git")} checked={false} onChange={() => {}} disabled note={t("download_git_unsupported")} />
              </div>
            </section>

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-base-border px-4 py-3 text-sm font-medium text-ink-dim">
                {t("cancel")}
              </button>
              <button
                onClick={startDownload}
                disabled={contents === "folder" && !folderPath.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-harbor-orange px-4 py-3 text-sm font-semibold text-white shadow-glow-orange disabled:opacity-50"
              >
                <Download size={16} /> {t("download_button")}
              </button>
            </div>
          </>
        ) : stage === "done" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={40} className="text-accent-green" />
            <p className="font-medium text-ink">{t("download_completed")}</p>
            <p className="font-mono text-sm text-ink-faint">{resultFilename}</p>
            <button onClick={onClose} className="mt-2 rounded-xl bg-harbor-orange px-5 py-2.5 text-sm font-semibold text-white shadow-glow-orange">
              {t("close")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 size={32} className="animate-spin text-harbor-orange" />
            <p className="font-medium text-ink">
              {stage === "preparing" && t("download_stage_preparing")}
              {stage === "fetching" && t("download_stage_fetching")}
              {stage === "zipping" && t("download_stage_zipping")}
              {stage === "uploading" && t("download_stage_uploading")}
            </p>
            {progress && (
              <>
                <p className="text-sm text-ink-dim">
                  {progress.current} / {progress.total} {t("download_files_word")}
                </p>
                {progress.currentFile && <p className="max-w-full truncate font-mono text-xs text-ink-faint">{progress.currentFile}</p>}
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-base-surface2">
                  <div
                    className="h-full rounded-full bg-harbor-orange transition-all"
                    style={{ width: `${Math.min(100, (progress.current / Math.max(1, progress.total)) * 100)}%` }}
                  />
                </div>
              </>
            )}
            <button onClick={cancel} className="mt-2 text-sm text-ink-faint underline">
              {t("cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RadioRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 text-left text-sm text-ink">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          active ? "border-harbor-orange" : "border-base-border"
        }`}
      >
        {active && <span className="h-2.5 w-2.5 rounded-full bg-harbor-orange" />}
      </span>
      {label}
    </button>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
  disabled,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${disabled ? "opacity-50" : ""}`}>
      <CircleCheckbox checked={checked} onChange={disabled ? () => {} : onChange} color="orange" size={18} aria-label={label} />
      <div className="min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {note && <p className="text-xs text-ink-faint">{note}</p>}
      </div>
    </div>
  );
}
