"use client";

import { useCallback, useMemo, useState } from "react";
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
} from "lucide-react";
import Header from "@/components/Header";
import UploadZone, { UploadedBlob } from "@/components/UploadZone";
import TreeView from "@/components/TreeView";
import ZipWarnings, { ZipWarningsData } from "@/components/ZipWarnings";
import PreviewFrame, { ConsoleLine } from "@/components/PreviewFrame";
import PreviewConsole from "@/components/PreviewConsole";
import { useLang } from "@/lib/i18n-context";
import { useBlobCleanup } from "@/lib/use-blob-cleanup";
import { extractZipClient, ClientFile } from "@/lib/client-zip";
import { buildStaticPreview, revokePreview, BuiltPreview } from "@/lib/static-preview";

interface AnalyzeResult {
  ok: true;
  framework: string;
  buildCommand: string | null;
  fileCount: number;
  tree: any[];
  warnings?: ZipWarningsData;
}

type Tab = "preview" | "files" | "console";

export default function PreviewPage() {
  const { t } = useLang();
  const router = useRouter();

  const [blob, setBlob] = useState<UploadedBlob | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);

  const [buildState, setBuildState] = useState<"idle" | "loading" | "ready" | "unsupported" | "error">("idle");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [files, setFiles] = useState<ClientFile[] | null>(null);
  const [preview, setPreview] = useState<BuiltPreview | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [tab, setTab] = useState<Tab>("preview");
  const [handingOff, setHandingOff] = useState(false);

  // Deletes the uploaded blob if the user leaves without ever continuing to
  // GitHub — but not once we've kicked off that handoff, since the next
  // page reuses this same blob instead of re-uploading.
  useBlobCleanup(handingOff ? null : blob);

  const handleConsoleMessage = useCallback((line: ConsoleLine) => {
    setConsoleLines((prev) => [...prev, line]);
  }, []);

  async function runPreview(projectFiles: ClientFile[]) {
    setBuildState("loading");
    setBuildError(null);
    setConsoleLines([]);
    try {
      const built = buildStaticPreview(projectFiles);
      if (!built) {
        setBuildState("unsupported");
        return;
      }
      setPreview((prevPreview) => {
        revokePreview(prevPreview);
        return built;
      });
      setFrameKey((k) => k + 1);
      setBuildState("ready");
      setConsoleLines([{ level: "info", text: t("preview_build_success"), ts: Date.now() }]);
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

  function handleReload() {
    if (files) runPreview(files);
  }

  function handleFullscreen() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([preview.html], { type: "text/html" }));
    window.open(url, "_blank");
    // Leave revocation to GC / page unload — revoking immediately can race
    // the new tab's initial load on slower devices.
  }

  function continueToGithub(mode: "new" | "update") {
    if (!blob) return;
    setHandingOff(true);
    const params = new URLSearchParams({
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      fileName,
    });
    router.push(`/tools/github/${mode}?${params.toString()}`);
  }

  const displayTree = useMemo(() => analysis?.tree ?? [], [analysis]);

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
              <p className="text-sm text-ink-dim">
                {t("detected")}: <span className="font-medium text-ink">{analysis.framework}</span>
              </p>
              <p className="mt-1 text-sm text-ink-dim">
                {analysis.fileCount} {t("files_count")}
              </p>
            </div>

            <ZipWarnings warnings={analysis.warnings} />

            {/* Tabs */}
            <div className="flex rounded-xl border border-base-border bg-base-surface p-1">
              {(["preview", "files", "console"] as Tab[]).map((tabKey) => (
                <button
                  key={tabKey}
                  onClick={() => setTab(tabKey)}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                    tab === tabKey ? "bg-harbor-orange text-white shadow-glow-orange" : "text-ink-dim"
                  }`}
                >
                  {t(`preview_tab_${tabKey}` as const)}
                </button>
              ))}
            </div>

            {tab === "preview" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleReload}
                    disabled={buildState !== "ready"}
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
                  {buildState === "ready" && preview && (
                    <PreviewFrame html={preview.html} frameKey={frameKey} onMessage={handleConsoleMessage} />
                  )}
                </div>
              </div>
            )}

            {tab === "files" && (
              <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-base-border bg-base-bg p-2">
                <div className="flex items-center gap-1 px-1 pb-1 text-xs text-ink-faint">
                  <FolderTree size={14} /> {t("file_structure")}
                </div>
                <TreeView nodes={displayTree} />
              </div>
            )}

            {tab === "console" && <PreviewConsole lines={consoleLines} emptyLabel={t("preview_console_empty")} />}

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
