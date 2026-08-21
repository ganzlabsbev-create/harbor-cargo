"use client";

import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  UploadCloud,
  Loader2,
  Check,
  X,
  TriangleAlert,
  RotateCcw,
  Download,
  ImagePlus,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import Header from "@/components/Header";
import { useLang } from "@/lib/i18n-context";
import { extractZipClient, type ClientFile } from "@/lib/client-zip";
import { analyzeProject, formatBytes } from "@/lib/pwa/analyze";
import { generatePwaPackage, downloadBlob } from "@/lib/pwa/build";
import { PwaValidationError, type ValidationResult } from "@/lib/pwa/validate";
import { loadIconFromFile, isAcceptedIconFile } from "@/lib/pwa/icons";
import type { ProjectAnalysis, PwaFormState, GenerateStep, DisplayMode, ValidationIssue } from "@/lib/pwa/types";

type Phase = "select" | "loaded" | "generating" | "done" | "error";

// §UX pass: known OutputValidator codes get a humanized i18n key
// ("pwa_issue_<code>"); anything unrecognized falls back to a generic
// message so a brand-new code never leaks a raw string to the user.
const KNOWN_ISSUE_CODES = new Set([
  "manifest_missing",
  "manifest_undecodable",
  "manifest_invalid_json",
  "manifest_not_object",
  "manifest_bad_field_type",
  "manifest_icons_not_array",
  "manifest_icon_malformed",
  "manifest_icon_missing_src",
  "manifest_icon_missing_file",
  "sw_registration_target_missing",
  "duplicate_manifest_link",
  "duplicate_sw_registration",
  "unsafe_path",
  "case_collision",
  "planned_write_missing",
  "unplanned_create",
  "unplanned_update",
  "plan_mismatch",
  "preserve_violated",
  "skip_violated",
  "planned_create_missing",
  "planned_update_missing",
]);

function issueMessage(issue: ValidationIssue, t: (k: any) => string): string {
  const key = KNOWN_ISSUE_CODES.has(issue.code) ? "pwa_issue_" + issue.code : "pwa_issue_generic";
  return t(key as any);
}

interface LoadedIconState {
  image: HTMLImageElement;
  fileName: string;
  previewUrl: string;
  isSquare: boolean;
}

const STEP_ORDER: GenerateStep[] = ["analyzing", "icons", "manifest", "html", "sw", "packaging"];
const STEP_LABEL_KEY: Record<GenerateStep, string> = {
  analyzing: "pwa_progress_analyzing",
  icons: "pwa_progress_icons",
  manifest: "pwa_progress_manifest",
  html: "pwa_progress_html",
  sw: "pwa_progress_sw",
  packaging: "pwa_progress_packaging",
};

function strategyLabelKey(strategy: ProjectAnalysis["strategy"]): any {
  switch (strategy) {
    case "next-app-router":
      return "pwa_strategy_next_app_router";
    case "nuxt3":
      return "pwa_strategy_nuxt3";
    case "html-shell":
      return "pwa_strategy_html_shell";
    default:
      return "pwa_strategy_unsupported";
  }
}

export default function HarborPwaPage() {
  const { t } = useLang();

  const [phase, setPhase] = useState<Phase>("select");
  const [isDragging, setDragging] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [zipName, setZipName] = useState("");
  const [zipBytes, setZipBytes] = useState(0);
  const [files, setFiles] = useState<ClientFile[] | null>(null);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);

  const [form, setForm] = useState<PwaFormState | null>(null);
  const [icon, setIcon] = useState<LoadedIconState | null>(null);
  const [iconBytes, setIconBytes] = useState<Uint8Array | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);

  const [genStep, setGenStep] = useState<GenerateStep | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genValidation, setGenValidation] = useState<ValidationResult | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult] = useState<{ zipBlob: Blob; added: string[]; updated: string[]; unchanged: string[]; manualSteps: string[] } | null>(null);

  const zipInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  async function handleZipFile(file: File) {
    setLoadError(null);
    if (!/\.zip$/i.test(file.name)) {
      setLoadError(t("pwa_error_invalid_zip"));
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const parsed = await extractZipClient(buf);
      if (parsed.length === 0) throw new Error("empty");

      const a = analyzeProject(parsed);
      if (a.strategy === "unsupported") {
        const key = "pwa_error_unsupported_" + (a.strategyNote || "no_shell_found");
        setLoadError(t(key as any));
        return;
      }

      setZipName(file.name);
      setZipBytes(file.size);
      setFiles(parsed);
      setAnalysis(a);
      setForm({
        appName: a.suggestedAppName,
        shortName: a.suggestedAppName.slice(0, 12),
        description: a.suggestedDescription,
        startUrl: a.suggestedStartUrl,
        themeColor: "#0560D0",
        backgroundColor: "#0A1930",
        display: "standalone",
        replaceManifest: false,
        replaceServiceWorker: false,
        replaceIcons: false,
      });
      setPhase("loaded");
    } catch {
      setLoadError(t("pwa_error_invalid_zip"));
    }
  }

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleZipFile(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleIconFile(file: File) {
    setIconError(null);
    if (!isAcceptedIconFile(file)) {
      setIconError(t("pwa_icon_hint"));
      return;
    }
    try {
      const { loaded, bytes, objectUrl } = await loadIconFromFile(file);
      setIcon({ image: loaded.image, fileName: file.name, previewUrl: objectUrl, isSquare: loaded.isSquare });
      setIconBytes(bytes);
    } catch {
      setIconError(t("pwa_icon_hint"));
    }
  }

  function resetAll() {
    setPhase("select");
    setLoadError(null);
    setZipName("");
    setZipBytes(0);
    setFiles(null);
    setAnalysis(null);
    setForm(null);
    setIcon(null);
    setIconBytes(null);
    setIconError(null);
    setGenStep(null);
    setGenError(null);
    setGenValidation(null);
    setShowTechDetails(false);
    setShowAdvanced(false);
    setResult(null);
  }

  const validationErrors: string[] = [];
  if (form) {
    if (!form.appName.trim()) validationErrors.push(t("pwa_validation_app_name"));
    if (form.shortName.trim().length === 0 || form.shortName.trim().length > 12) validationErrors.push(t("pwa_validation_short_name"));
    if (!icon) validationErrors.push(t("pwa_validation_icon"));
  }

  async function handleGenerate() {
    if (!files || !analysis || !form || !icon) return;
    setGenError(null);
    setGenValidation(null);
    setShowTechDetails(false);
    setPhase("generating");
    try {
      const res = await generatePwaPackage({
        files,
        analysis,
        form,
        iconImage: icon.image,
        onStep: (s) => setGenStep(s),
      });
      setResult(res);
      setPhase("done");
    } catch (e) {
      // §15 / §UX pass: don't collapse every failure into the same generic
      // message — OutputValidator rejections are a known, expected outcome
      // (Harbor chose not to ship a bad ZIP), not an unexpected crash, and
      // the original project was never touched in that case. Surface the
      // real detail (what broke, which file, why) right here — never bounce
      // the person back to a blank upload screen; `form`/`analysis`/`files`
      // are untouched, so "back to settings" just re-shows this same
      // filled-in page.
      if (e instanceof PwaValidationError) {
        setGenValidation(e.result);
      } else {
        setGenError(t("pwa_generation_failed_generic"));
      }
      setPhase("error");
    }
  }

  function updateForm(patch: Partial<PwaFormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/tools/harbor" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <div className="mb-4 flex items-center gap-2">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("tool_pwa_title")}</h1>
          <span className="rounded-full border border-harbor-blue/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-harbor-blue">
            DEMO
          </span>
        </div>

        {phase === "select" && (
          <>
            <p className="mb-4 text-sm text-ink-dim">{t("pwa_intro")}</p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition ${
                isDragging ? "border-harbor-blue bg-harbor-blue/5" : "border-base-border bg-base-surface"
              }`}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-harbor-blue to-harbor-navy text-white shadow-glow-blue">
                <UploadCloud size={24} strokeWidth={1.75} />
              </div>
              <button
                onClick={() => zipInputRef.current?.click()}
                className="rounded-xl bg-harbor-blue px-5 py-3 font-display font-semibold text-white shadow-glow-blue active:scale-[0.99]"
              >
                {t("pwa_select_zip")}
              </button>
              <p className="hidden text-xs text-ink-faint sm:block">{t("pwa_drop_hint")}</p>
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleZipFile(e.target.files[0])}
              />
            </div>
            {loadError && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-accent-red">
                <TriangleAlert size={14} /> {loadError}
              </p>
            )}
          </>
        )}

        {phase === "loaded" && analysis && form && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
              <div className="flex items-center gap-2 text-sm font-medium text-accent-green">
                <Check size={15} /> {t("pwa_project_loaded")}
              </div>
              <p className="mt-2 truncate text-sm text-ink">{zipName}</p>
              <p className="text-xs text-ink-faint">
                {t("pwa_files_label")}: {analysis.fileCount} · {t("pwa_size_label")}: {formatBytes(zipBytes)}
              </p>
              <p className="mt-2 text-xs text-ink-dim">
                {t("pwa_detected_label")}: <span className="font-medium text-ink">{analysis.framework || "—"}</span>
              </p>
              <p className="text-xs text-ink-dim">
                {t("pwa_strategy_label")}: <span className="font-medium text-ink">{t(strategyLabelKey(analysis.strategy))}</span>
              </p>
              <p className="text-xs text-ink-dim">
                {t("pwa_touches_label")}:{" "}
                <span className="font-medium text-ink">{analysis.entryHtmlPath || analysis.configFilePath || "—"}</span>
              </p>
            </div>

            {analysis.needsBuild && (
              <div className="flex items-start gap-2 rounded-xl border border-accent-orange/30 bg-accent-orange/5 px-3 py-2.5 text-xs text-accent-orange">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>{t("pwa_framework_warning").replace("{framework}", analysis.framework || "")}</span>
              </div>
            )}

            <StatusCard analysis={analysis} t={t} />

            {/* §UX pass: when Harbor had more than one candidate to choose
                from (manifest / Service Worker / entry HTML), say so and
                name the one it picked — the person never has to choose
                manually unless nothing could be picked safely. */}
            <AutoSelectNotes analysis={analysis} files={files} t={t} />

            <Section title={t("pwa_section_icon")}>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => iconInputRef.current?.click()}
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-base-border bg-base-surface2"
                >
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus size={22} className="text-ink-faint" />
                  )}
                </button>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => iconInputRef.current?.click()}
                    className="w-fit rounded-lg border border-base-border bg-base-surface2 px-3 py-1.5 text-xs font-medium text-ink"
                  >
                    {icon ? t("pwa_change_icon_button") : t("pwa_choose_icon_button")}
                  </button>
                  <span className="text-[11px] text-ink-faint">{t("pwa_icon_hint")}</span>
                </div>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleIconFile(e.target.files[0])}
                />
              </div>
              {icon && !icon.isSquare && (
                <p className="flex items-center gap-1.5 text-xs text-accent-orange">
                  <TriangleAlert size={13} /> {t("pwa_icon_not_square_warning")}
                </p>
              )}
              {iconError && <p className="text-xs text-accent-red">{iconError}</p>}
            </Section>

            {/* §UX pass: everything below is already set to Harbor's
                recommended defaults — tucked behind "Advanced settings" so
                the default path is just zip → icon → Generate. */}
            <div className="rounded-2xl border border-base-border bg-base-surface shadow-card">
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-sm font-semibold text-ink">{t("pwa_advanced_settings_title")}</span>
                  <span className="text-[11px] text-ink-faint">{t("pwa_advanced_settings_hint")}</span>
                </span>
                {showAdvanced ? (
                  <ChevronDown size={18} className="shrink-0 text-ink-faint" />
                ) : (
                  <ChevronRight size={18} className="shrink-0 text-ink-faint" />
                )}
              </button>

              {showAdvanced && (
                <div className="flex flex-col gap-4 border-t border-base-border p-4">
                  <Section title={t("pwa_section_identity")}>
                    <Field label={t("pwa_app_name_label")}>
                      <input
                        value={form.appName}
                        onChange={(e) => updateForm({ appName: e.target.value })}
                        placeholder={t("pwa_app_name_placeholder")}
                        className={inputClass}
                      />
                    </Field>
                    <Field label={t("pwa_short_name_label")}>
                      <input
                        value={form.shortName}
                        onChange={(e) => updateForm({ shortName: e.target.value.slice(0, 12) })}
                        placeholder={t("pwa_short_name_placeholder")}
                        className={inputClass}
                        maxLength={12}
                      />
                    </Field>
                    <Field label={t("pwa_description_label")}>
                      <input
                        value={form.description}
                        onChange={(e) => updateForm({ description: e.target.value })}
                        placeholder={t("pwa_description_placeholder")}
                        className={inputClass}
                      />
                    </Field>
                    <Field label={t("pwa_start_url_label")}>
                      <input value={form.startUrl} onChange={(e) => updateForm({ startUrl: e.target.value })} className={inputClass} />
                    </Field>
                  </Section>

                  <Section title={t("pwa_section_appearance")}>
                    <div className="flex flex-col gap-3">
                      <Field label={t("pwa_theme_color_label")}>
                        <ColorInput value={form.themeColor} onChange={(v) => updateForm({ themeColor: v })} />
                      </Field>
                      <Field label={t("pwa_bg_color_label")}>
                        <ColorInput value={form.backgroundColor} onChange={(v) => updateForm({ backgroundColor: v })} />
                      </Field>
                    </div>
                    <Field label={t("pwa_display_mode_label")}>
                      <select
                        value={form.display}
                        onChange={(e) => updateForm({ display: e.target.value as DisplayMode })}
                        className={inputClass}
                      >
                        {(["standalone", "fullscreen", "minimal-ui", "browser"] as DisplayMode[]).map((mode) => (
                          <option key={mode} value={mode}>
                            {t(`pwa_display_${mode.replace("-", "_")}` as any)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </Section>

                  {analysis.existingManifestPath && (
                    <ToggleCard
                      title={t("pwa_existing_manifest_detected")}
                      keepLabel={t("pwa_keep_manifest")}
                      replaceLabel={t("pwa_replace_manifest")}
                      value={form.replaceManifest}
                      onChange={(v) => updateForm({ replaceManifest: v })}
                    />
                  )}
                  {analysis.existingServiceWorkerPath && (
                    <ToggleCard
                      title={t("pwa_existing_sw_detected")}
                      keepLabel={t("pwa_keep_sw")}
                      replaceLabel={t("pwa_replace_sw")}
                      value={form.replaceServiceWorker}
                      onChange={(v) => updateForm({ replaceServiceWorker: v })}
                    />
                  )}
                  {analysis.hasIcons && (
                    <ToggleCard
                      title={t("pwa_existing_icons_detected")}
                      keepLabel={t("pwa_keep_icons")}
                      replaceLabel={t("pwa_replace_icons")}
                      value={form.replaceIcons}
                      onChange={(v) => updateForm({ replaceIcons: v })}
                    />
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={validationErrors.length > 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-harbor-blue px-5 py-3.5 font-display font-semibold text-white shadow-glow-blue disabled:opacity-40"
            >
              {t("pwa_generate_button")}
            </button>
            {validationErrors.length > 0 && (
              <ul className="-mt-2 flex flex-col gap-1 text-xs text-ink-faint">
                {validationErrors.map((msg) => (
                  <li key={msg}>· {msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {phase === "generating" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-base-border bg-base-surface p-6 shadow-card">
            {STEP_ORDER.map((step) => {
              const currentIdx = genStep ? STEP_ORDER.indexOf(genStep) : -1;
              const stepIdx = STEP_ORDER.indexOf(step);
              const state = stepIdx < currentIdx ? "done" : stepIdx === currentIdx ? "active" : "pending";
              return (
                <div key={step} className="flex items-center gap-2.5 text-sm">
                  {state === "done" && <Check size={16} className="text-accent-green" />}
                  {state === "active" && <Loader2 size={16} className="animate-spin text-harbor-blue" />}
                  {state === "pending" && <div className="h-4 w-4 rounded-full border border-base-border" />}
                  <span className={state === "pending" ? "text-ink-faint" : "text-ink"}>{t(STEP_LABEL_KEY[step] as any)}</span>
                </div>
              );
            })}
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-accent-red/30 bg-accent-red/5 p-5">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-red/10 text-accent-red">
                  <X size={18} />
                </div>
                <div>
                  <p className="font-display text-base font-semibold text-ink">{t("pwa_generation_failed_title")}</p>
                  <p className="text-xs text-ink-dim">{t("pwa_generation_failed_subtitle")}</p>
                </div>
              </div>

              {genValidation && genValidation.errors.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {genValidation.errors.map((issue, i) => (
                    <div key={i} className="rounded-xl border border-accent-red/20 bg-base-surface p-3">
                      <p className="text-xs font-medium text-ink">
                        <span className="text-accent-red">{t("pwa_issue_found_label")}:</span> {issueMessage(issue, t)}
                      </p>
                      {issue.path && (
                        <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
                          {t("pwa_issue_file_label")}: &quot;{issue.path}&quot;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {genError && !genValidation && <p className="text-xs text-ink-dim">{genError}</p>}

              <p className="text-xs font-medium text-ink-dim">{t("pwa_original_project_untouched")}</p>

              {genValidation && genValidation.errors.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowTechDetails((v) => !v)}
                    className="flex items-center gap-1 text-[11px] font-medium text-ink-faint underline decoration-dotted underline-offset-2"
                  >
                    {showTechDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {t("pwa_technical_details_toggle")}
                  </button>
                  {showTechDetails && (
                    <div className="mt-2 flex flex-col gap-1 rounded-lg bg-base-surface2 p-3 font-mono text-[10px] text-ink-faint">
                      {genValidation.errors.map((issue, i) => (
                        <div key={i}>
                          [{issue.severity}] {issue.code}
                          {issue.path ? ` — ${issue.path}` : ""}
                          {": "}
                          {issue.detail}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleGenerate}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-harbor-blue px-4 py-2.5 text-sm font-display font-semibold text-white shadow-glow-blue active:scale-[0.99]"
                >
                  <RotateCcw size={15} /> {t("pwa_retry_button")}
                </button>
                <button
                  onClick={() => setPhase("loaded")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-base-border bg-base-surface2 px-4 py-2.5 text-sm font-medium text-ink-dim active:scale-[0.99]"
                >
                  {t("pwa_back_to_settings_button")}
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-base-border bg-base-surface p-8 text-center shadow-card">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-green/10 text-accent-green">
                <Check size={26} />
              </div>
              <p className="font-display text-lg font-semibold text-ink">{t("pwa_ready_title")}</p>
              <button
                onClick={() => downloadBlob(result.zipBlob, zipName.replace(/\.zip$/i, "") + "-pwa.zip")}
                className="flex items-center gap-2 rounded-xl bg-harbor-orange px-5 py-3 font-display font-semibold text-white shadow-glow-orange active:scale-[0.99]"
              >
                <Download size={17} /> {t("pwa_download_button")}
              </button>
            </div>

            {result.added.length > 0 && (
              <FileList title={t("pwa_files_added")} files={result.added} prefix="+" className="text-accent-green" />
            )}
            {result.updated.length > 0 && (
              <FileList title={t("pwa_files_updated")} files={result.updated} prefix="~" className="text-harbor-blue" />
            )}
            {result.unchanged.length > 0 && (
              <FileList title={t("pwa_files_unchanged")} files={result.unchanged} prefix="=" className="text-ink-muted" />
            )}

            {result.manualSteps.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-accent-orange/30 bg-accent-orange/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-orange">
                  <TriangleAlert size={13} /> {t("pwa_manual_steps_title")}
                </p>
                <ul className="flex flex-col gap-1 text-xs text-accent-orange">
                  {result.manualSteps.map((key) => (
                    <li key={key}>· {t(("pwa_manual_" + key) as any)}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={resetAll}
              className="flex items-center justify-center gap-2 rounded-xl border border-base-border bg-base-surface2 px-5 py-3 text-sm font-medium text-ink-dim active:scale-[0.99]"
            >
              <RotateCcw size={15} /> {t("pwa_start_over")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

const inputClass = "rounded-xl border border-base-border bg-base-surface px-4 py-3 text-ink outline-none focus:border-harbor-blue";
const labelClass = "text-sm font-medium text-ink-dim";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className || ""}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className={`flex items-center gap-2 ${inputClass} py-2`}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 shrink-0 cursor-pointer bg-transparent" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
      />
    </div>
  );
}

function ToggleCard({
  title,
  keepLabel,
  replaceLabel,
  value,
  onChange,
}: {
  title: string;
  keepLabel: string;
  replaceLabel: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-accent-orange/30 bg-accent-orange/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-accent-orange">
        <TriangleAlert size={13} /> {title}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(false)}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${
            !value ? "bg-base-surface2 text-ink" : "text-ink-faint"
          }`}
        >
          {keepLabel}
        </button>
        <button
          onClick={() => onChange(true)}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${
            value ? "bg-harbor-orange text-white" : "text-ink-faint"
          }`}
        >
          {replaceLabel}
        </button>
      </div>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <Check size={14} className="text-accent-green" /> : <X size={14} className="text-ink-faint" />}
      <span className={ok ? "text-ink" : "text-ink-faint"}>{label}</span>
    </div>
  );
}

function StatusCard({ analysis, t }: { analysis: ProjectAnalysis; t: (k: any) => string }) {
  return (
    <div className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
      <p className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-ink-faint">{t("pwa_status_title")}</p>
      <div className="flex flex-col gap-1.5">
        <StatusRow label={t("pwa_status_manifest")} ok={!!analysis.existingManifestPath} />
        <StatusRow label={t("pwa_status_icons")} ok={analysis.hasIcons} />
        <StatusRow label={t("pwa_status_sw")} ok={!!analysis.existingServiceWorkerPath} />
        <StatusRow label={t("pwa_status_html")} ok={analysis.strategy !== "unsupported"} />
      </div>
    </div>
  );
}

/**
 * §UX pass, item 3: Harbor already auto-selects the manifest / Service
 * Worker / entry HTML it uses (see detectManifest / detectServiceWorker /
 * analyzeProject) — this only makes that decision visible when there was
 * more than one real candidate to choose between, so the person understands
 * why file X was picked instead of being asked to pick it themselves.
 */
function AutoSelectNotes({ analysis, files, t }: { analysis: ProjectAnalysis; files: ClientFile[] | null; t: (k: any) => string }) {
  const notes: { key: string; text: string }[] = [];

  const manifestCandidates = analysis.existingManifest.candidates.filter((c) => c.confidence !== "low");
  if (analysis.existingManifestPath && manifestCandidates.length > 1) {
    notes.push({
      key: "manifest",
      text: t("pwa_auto_selected_manifest")
        .replace("{count}", String(manifestCandidates.length))
        .replace("{path}", analysis.existingManifestPath),
    });
  }

  const swCandidates = analysis.existingServiceWorker.candidates.filter(
    (c) => c.confidence !== "low" && c.sourceType !== "generator-source"
  );
  if (analysis.existingServiceWorkerPath && swCandidates.length > 1) {
    notes.push({
      key: "sw",
      text: t("pwa_auto_selected_sw")
        .replace("{count}", String(swCandidates.length))
        .replace("{path}", analysis.existingServiceWorkerPath),
    });
  }

  const htmlCount = files ? files.filter((f) => f.ext === "html").length : 0;
  if (analysis.entryHtmlPath && !analysis.entryHtmlNeedsCreate && htmlCount > 1) {
    notes.push({
      key: "entry",
      text: t("pwa_auto_selected_entry_html").replace("{count}", String(htmlCount)).replace("{path}", analysis.entryHtmlPath),
    });
  }

  if (notes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {notes.map((n) => (
        <div key={n.key} className="flex items-start gap-2 rounded-xl border border-harbor-blue/20 bg-harbor-blue/5 px-3 py-2.5 text-xs text-ink-dim">
          <Info size={14} className="mt-0.5 shrink-0 text-harbor-blue" />
          <span>{n.text}</span>
        </div>
      ))}
    </div>
  );
}

function FileList({ title, files, prefix, className }: { title: string; files: string[]; prefix: string; className: string }) {
  return (
    <div className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
      <p className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</p>
      <div className="flex flex-col gap-1 font-mono text-xs">
        {files.map((f) => (
          <span key={f} className={className}>
            {prefix} {f}
          </span>
        ))}
      </div>
    </div>
  );
}
