"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  RotateCw,
  Maximize2,
  FolderTree,
  FolderPlus,
  RefreshCcw,
  TriangleAlert,
  Loader2,
  Menu,
  X,
  Terminal,
  MonitorSmartphone,
} from "lucide-react";
import Header from "@/components/Header";
import UploadZone, { UploadedBlob } from "@/components/UploadZone";
import TreeView from "@/components/TreeView";
import ZipWarnings, { ZipWarningsData } from "@/components/ZipWarnings";
import PreviewFrame from "@/components/PreviewFrame";
import PreviewLog, { PreviewLogLine } from "@/components/PreviewLog";
import { useLang } from "@/lib/i18n-context";
import { useBlobCleanup } from "@/lib/use-blob-cleanup";
import { extractZipClient, ClientFile } from "@/lib/client-zip";
import { buildStaticPreview, revokePreview, BuiltPreview } from "@/lib/static-preview";
import { runDevServerPreview, stopDevServerPreview, isDevServerSupported, DevServerHandle } from "@/lib/dev-server-preview";

interface AnalyzeResult {
  ok: true;
  framework: string;
  buildCommand: string | null;
  fileCount: number;
  tree: any[];
  warnings?: ZipWarningsData;
}

type Section = "preview" | "files" | "logs";
type BuildState = "idle" | "installing" | "starting" | "loading" | "ready" | "unsupported" | "error";
type Mode = "static" | "devserver" | null;

export default function PreviewPage() {
  const { t } = useLang();
  const router = useRouter();

  const [blob, setBlob] = useState<UploadedBlob | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);

  const [buildState, setBuildState] = useState<BuildState>("idle");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [files, setFiles] = useState<ClientFile[] | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [staticPreview, setStaticPreview] = useState<BuiltPreview | null>(null);
  const [devHandle, setDevHandle] = useState<DevServerHandle | null>(null);
  const [devFramework, setDevFramework] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [logs, setLogs] = useState<PreviewLogLine[]>([]);
  const [section, setSection] = useState<Section>("preview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [handingOff, setHandingOff] = useState(false);

  // Deletes the uploaded blob if the user leaves without ever continuing to
  // GitHub — but not once we've kicked off that handoff, since the next
  // page reuses this same blob instead of re-uploading.
  useBlobCleanup(handingOff ? null : blob);

  // Stop the WebContainer dev process (not the boot itself — that stays
  // warm) whenever this page goes away.
  useEffect(() => {
    return () => {
      stopDevServerPreview();
    };
  }, []);

  const appendLog = useCallback((line: PreviewLogLine) => {
    setLogs((prev) => [...prev, line]);
  }, []);

  async function runPreview(projectFiles: ClientFile[]) {
    setBuildError(null);
    setLogs([]);
    setMode(null);

    // Try the real dev server first when this looks like a Node/framework
    // project and the browser can actually run one (cross-origin isolated +
    // SharedArrayBuffer). Anything else — plain static projects, or a
    // browser that can't run WebContainers (notably some iOS Safari
    // versions) — falls straight through to the Phase 1 static preview
    // below, no error shown for that alone.
    const hasPackageJson = projectFiles.some((f) => f.path === "package.json");
    if (hasPackageJson && isDevServerSupported()) {
      try {
        setBuildState("installing");
        const handle = await runDevServerPreview(projectFiles, (line) => {
          if (line.level === "install") setBuildState("installing");
          if (line.level === "dev") setBuildState("starting");
          appendLog(line);
        });
        if (handle) {
          setDevHandle(handle);
          setDevFramework(handle.framework);
          setMode("devserver");
          setFrameKey((k) => k + 1);
          setBuildState("ready");
          appendLog({ level: "info", text: t("preview_devserver_ready"), ts: Date.now() });
          return;
        }
        // handle === null → no recognizable dev command, fall through to static
      } catch (err: any) {
        appendLog({ level: "error", text: String(err?.message || err), ts: Date.now() });
        appendLog({ level: "info", text: t("preview_devserver_fallback"), ts: Date.now() });
        // fall through to static preview instead of dead-ending here
      }
    } else if (hasPackageJson) {
      appendLog({ level: "info", text: t("preview_devserver_unsupported_browser"), ts: Date.now() });
    }

    setBuildState("loading");
    try {
      const built = buildStaticPreview(projectFiles);
      if (!built) {
        setBuildState("unsupported");
        return;
      }
      setStaticPreview((prevPreview) => {
        revokePreview(prevPreview);
        return built;
      });
      setMode("static");
      setFrameKey((k) => k + 1);
      setBuildState("ready");
      appendLog({ level: "info", text: t("preview_build_success"), ts: Date.now() });
    } catch (err: any) {
      setBuildState("error");
      setBuildError(String(err?.message || err));
    }
  }

  async function handleAnalyzed(b: UploadedBlob, data: AnalyzeResult, name: string) {
    setBlob(b);
    setAnalysis(data);
    setFileName(name);

    try {
      const res = await fetch(b.url);
      if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
      const buf = await res.arrayBuffer();
      const extracted = await extractZipClient(buf);
      setFiles(extracted);
      await runPreview(extracted);
    } catch (err: any) {
      setBuildState("error");
      setBuildError(String(err?.message || err));
    }
  }

  async function handleReload() {
    if (!files) return;
    await stopDevServerPreview();
    setDevHandle(null);
    runPreview(files);
  }

  function handleFullscreen() {
    if (mode === "devserver" && devHandle) {
      window.open(devHandle.url, "_blank");
      return;
    }
    if (mode === "static" && staticPreview) {
      const url = URL.createObjectURL(new Blob([staticPreview.html], { type: "text/html" }));
      window.open(url, "_blank");
      // Leave revocation to GC / page unload — revoking immediately can race
      // the new tab's initial load on slower devices.
    }
  }

  function continueToGithub(githubMode: "new" | "update") {
    if (!blob) return;
    setHandingOff(true);
    const params = new URLSearchParams({
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      fileName,
    });
    router.push(`/tools/github/${githubMode}?${params.toString()}`);
  }

  const displayTree = useMemo(() => analysis?.tree ?? [], [analysis]);

  const SECTIONS: { key: Section; label: string }[] = [
    { key: "preview", label: t("preview_tab_preview") },
    { key: "files", label: t("preview_tab_files") },
    { key: "logs", label: t("preview_tab_logs") },
  ];

  const isBusy = buildState === "installing" || buildState === "starting" || buildState === "loading";

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        {!analysis ? (
          <>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("tool_preview_title")}</h1>
            <p className="mb-4 mt-1 text-sm text-ink-dim">{t("preview_intro")}</p>
            <UploadZone onAnalyzed={handleAnalyzed} uploadingLabel={t("upload_uploading")} />
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-ink-dim">
                    {t("detected")}: <span className="font-medium text-ink">{analysis.framework}</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-dim">
                    {analysis.fileCount} {t("files_count")}
                  </p>
                </div>
                {mode === "devserver" && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-green/10 px-2.5 py-1 text-[11px] font-medium text-accent-green">
                    <Terminal size={12} /> {t("preview_mode_devserver")}
                    {devFramework ? ` · ${devFramework}` : ""}
                  </span>
                )}
                {mode === "static" && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-harbor-blue/10 px-2.5 py-1 text-[11px] font-medium text-harbor-blue">
                    <MonitorSmartphone size={12} /> {t("preview_mode_static")}
                  </span>
                )}
              </div>
            </div>

            <ZipWarnings warnings={analysis.warnings} />

            {/* Section switcher — a ☰ menu (same pattern as the Vercel project
                dashboard) instead of a row of tabs, since Logs is often long
                and a horizontal tab bar would get cramped on a phone screen. */}
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">{SECTIONS.find((s) => s.key === section)?.label}</h2>
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={t("preview_menu_label")}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-base-border bg-base-surface text-ink"
                >
                  {menuOpen ? <X size={16} /> : <Menu size={16} />}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-11 z-10 w-44 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
                    {SECTIONS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => {
                          setSection(s.key);
                          setMenuOpen(false);
                        }}
                        className={`block w-full px-4 py-2.5 text-left text-sm transition ${
                          section === s.key ? "bg-harbor-orange/10 font-medium text-harbor-orange" : "text-ink-dim hover:bg-base-surface2"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {section === "preview" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleReload}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 rounded-lg border border-base-border bg-base-surface px-3 py-1.5 text-xs font-medium text-ink-dim disabled:opacity-40"
                  >
                    <RotateCw size={13} /> {t("preview_reload")}
                  </button>
                  <button
                    onClick={handleFullscreen}
                    disabled={buildState !== "ready"}
                    className="flex items-center gap-1.5 rounded-lg border border-base-border bg-base-surface px-3 py-1.5 text-xs font-medium text-ink-dim disabled:opacity-40"
                  >
                    <Maximize2 size={13} /> {t("preview_fullscreen")}
                  </button>
                </div>

                <div className="h-[26rem] overflow-hidden rounded-xl border border-base-border bg-base-surface2">
                  {buildState === "installing" && (
                    <div className="flex h-full items-center justify-center gap-2 px-6 text-center text-sm text-ink-dim">
                      <Loader2 size={18} className="animate-spin" /> {t("preview_installing")}
                    </div>
                  )}
                  {buildState === "starting" && (
                    <div className="flex h-full items-center justify-center gap-2 px-6 text-center text-sm text-ink-dim">
                      <Loader2 size={18} className="animate-spin" /> {t("preview_starting")}
                    </div>
                  )}
                  {buildState === "loading" && (
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-dim">
                      <Loader2 size={18} className="animate-spin" /> {t("preview_building")}
                    </div>
                  )}
                  {buildState === "unsupported" && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                      <TriangleAlert size={22} className="text-accent-orange" />
                      <p className="text-sm font-medium text-ink">{t("preview_unsupported_title")}</p>
                      <p className="text-xs text-ink-faint">{t("preview_unsupported_desc")}</p>
                    </div>
                  )}
                  {buildState === "error" && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                      <TriangleAlert size={22} className="text-accent-red" />
                      <p className="text-sm font-medium text-ink">{t("preview_load_failed")}</p>
                      {buildError && <p className="text-xs text-ink-faint">{buildError}</p>}
                    </div>
                  )}
                  {buildState === "ready" && mode === "static" && staticPreview && (
                    <PreviewFrame html={staticPreview.html} frameKey={frameKey} onMessage={appendLog} />
                  )}
                  {buildState === "ready" && mode === "devserver" && devHandle && (
                    <PreviewFrame src={devHandle.url} frameKey={frameKey} onMessage={appendLog} />
                  )}
                </div>
              </div>
            )}

            {section === "files" && (
              <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-base-border bg-base-bg p-2">
                <div className="flex items-center gap-1 px-1 pb-1 text-xs text-ink-faint">
                  <FolderTree size={14} /> {t("file_structure")}
                </div>
                <TreeView nodes={displayTree} />
              </div>
            )}

            {section === "logs" && <PreviewLog lines={logs} emptyLabel={t("preview_console_empty")} />}

            {/* Ship */}
            <div className="mt-2 flex flex-col gap-2">
              <p className="px-1 text-xs text-ink-faint">{t("preview_continue_to_github")}</p>
              <button
                onClick={() => continueToGithub("new")}
                className="flex items-center justify-center gap-2 rounded-xl bg-harbor-orange px-5 py-3.5 font-display font-semibold text-white shadow-glow-orange"
              >
                <FolderPlus size={18} /> {t("preview_create_new_repo")}
              </button>
              <button
                onClick={() => continueToGithub("update")}
                className="flex items-center justify-center gap-2 rounded-xl border border-base-border bg-base-surface px-5 py-3.5 font-display font-semibold text-ink shadow-card"
              >
                <RefreshCcw size={18} /> {t("preview_update_existing_repo")}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
