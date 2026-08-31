"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ClipboardPaste,
  UploadCloud,
} from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import RepoIcon from "@/components/RepoIcon";
import { useLang } from "@/lib/i18n-context";
import {
  parseAssetLinksJson,
  formatAssetLinksFile,
  assetLinksMatch,
  assetLinksUrlFor,
  ParsedAssetLinks,
} from "@/lib/assetlinks";

interface RepoOption {
  name: string;
  full_name: string;
  default_branch: string;
  updated_at: string;
  language?: string | null;
  logoUrl?: string | null;
}

const DEFAULT_TARGET_PATH = "public/.well-known/assetlinks.json";

/**
 * "Android App Identity" — Harbor Cargo does not sign anything and never
 * touches a keystore. PWABuilder's own Android packaging already produces
 * a fully signed apk/aab (when "Signing key" is set to New/Mine, not the
 * default None) and shows the exact Digital Asset Links JSON needed on its
 * results page. This tool's only job: take that JSON, validate it, and
 * push it into the repo at /.well-known/assetlinks.json — the file that
 * makes the wrapped app open full-screen instead of showing a browser
 * address bar. Then optionally confirm it's actually live.
 */
export default function HarborApkPage() {
  const { t } = useLang();

  // --- step 1: site url -----------------------------------------------
  const [siteUrl, setSiteUrl] = useState("");
  const pwabuilderHref = useMemo(() => {
    if (!siteUrl.trim()) return null;
    try {
      const u = new URL(siteUrl.trim());
      return `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(u.toString())}`;
    } catch {
      return null;
    }
  }, [siteUrl]);

  // --- step 2: paste + parse assetlinks json ---------------------------
  const [jsonInput, setJsonInput] = useState("");
  const parseResult = useMemo(() => (jsonInput.trim() ? parseAssetLinksJson(jsonInput) : null), [jsonInput]);
  const parsed: ParsedAssetLinks | null = parseResult?.ok ? parseResult.value : null;

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setJsonInput(text);
    } catch {
      // Clipboard permission denied/unavailable — the textarea itself still
      // accepts manual paste (Ctrl/Cmd+V), so this is a soft failure only.
    }
  }

  // --- step 3: repo + branch + push -------------------------------------
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [repoLoadError, setRepoLoadError] = useState<string | null>(null);
  const [reposRequested, setReposRequested] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [targetPath, setTargetPath] = useState(DEFAULT_TARGET_PATH);

  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<{ commitUrl: string } | null>(null);

  function loadRepos() {
    if (reposRequested) return;
    setReposRequested(true);
    fetch("/api/repos")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "load_failed");
        setRepos(data.repos);
      })
      .catch((err) => setRepoLoadError(String(err?.message || err)));
  }

  // Fires as soon as the pasted JSON becomes valid — not on hover/click of
  // step 3's box, which the person never actually touches right after
  // finishing step 2. That earlier version left `repos` stuck at null
  // forever with no fetch ever sent, showing an infinite "loading" spinner.
  useEffect(() => {
    if (parsed) loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!parsed]);

  function pickRepo(r: RepoOption) {
    setSelectedRepo(r);
    setSelectedBranch(r.default_branch);
    setBranches(null);
    setPushResult(null);
    setPushError(null);
    fetch(`/api/github/${r.full_name}/branches`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setBranches(data.branches.map((b: any) => b.name));
      })
      .catch(() => {});
  }

  async function pushToRepo() {
    if (!parsed || !selectedRepo || !selectedBranch) return;
    setPushing(true);
    setPushError(null);
    setPushResult(null);
    try {
      const [owner, repo] = selectedRepo.full_name.split("/");
      const content = formatAssetLinksFile(parsed);

      // Check whether the file already exists on this branch, so we send
      // the right change kind (and baseSha for a clean edit instead of a
      // blind overwrite the commit endpoint would otherwise reject).
      const treeRes = await fetch(`/api/github/${owner}/${repo}/code/tree?branch=${encodeURIComponent(selectedBranch)}`);
      const treeData = await treeRes.json();
      const existingSha: string | undefined = treeData.ok
        ? treeData.files.find((f: { path: string; sha: string }) => f.path === targetPath)?.sha
        : undefined;

      const change = existingSha
        ? { kind: "edit", path: targetPath, content, baseSha: existingSha }
        : { kind: "add", path: targetPath, content };

      const res = await fetch(`/api/github/${owner}/${repo}/code/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: selectedBranch,
          message: `Add Digital Asset Links (assetlinks.json) via Harbor`,
          changes: [change],
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error || "commit_failed");
      setPushResult({ commitUrl: data.commitUrl });
    } catch (err: any) {
      setPushError(String(err?.message || err));
    } finally {
      setPushing(false);
    }
  }

  // --- step 4: verify live -----------------------------------------------
  const verifyUrl = useMemo(() => (siteUrl.trim() ? assetLinksUrlFor(siteUrl.trim()) : null), [siteUrl]);
  const [verifying, setVerifying] = useState(false);
  const [verifyState, setVerifyState] = useState<"idle" | "match" | "mismatch" | "unreachable">("idle");
  const [verifyDetail, setVerifyDetail] = useState<string | null>(null);

  async function verifyLive() {
    if (!verifyUrl || !parsed) return;
    setVerifying(true);
    setVerifyState("idle");
    setVerifyDetail(null);
    try {
      const res = await fetch(`/api/tools/verify-assetlinks?url=${encodeURIComponent(verifyUrl)}`);
      const data = await res.json();
      if (!data.ok) {
        setVerifyState("unreachable");
        setVerifyDetail(data.error || "unreachable");
        return;
      }
      const liveParsed = parseAssetLinksJson(JSON.stringify(data.body));
      if (liveParsed.ok && assetLinksMatch(liveParsed.value, parsed)) {
        setVerifyState("match");
      } else {
        setVerifyState("mismatch");
      }
    } catch (err: any) {
      setVerifyState("unreachable");
      setVerifyDetail(String(err?.message || err));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/tools/harbor" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("apk_title")}</h1>
        <p className="mt-1 text-sm text-ink-dim">{t("apk_desc")}</p>

        {/* --- Step 1 ------------------------------------------------- */}
        <section className="mt-5 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
          <p className="font-display text-sm font-semibold text-ink">{t("apk_step1_title")}</p>
          <p className="mt-1 text-xs text-ink-dim">{t("apk_step1_desc")}</p>

          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://your-project.vercel.app"
            className="mt-3 w-full rounded-xl border border-base-border bg-base-bg px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint"
          />

          <a
            href={pwabuilderHref ?? undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!pwabuilderHref}
            className={`mt-3 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              pwabuilderHref
                ? "bg-harbor-orange text-white shadow-glow-orange active:scale-[0.99]"
                : "pointer-events-none bg-base-surface2 text-ink-faint"
            }`}
          >
            <ExternalLink size={15} /> {t("apk_open_pwabuilder")}
          </a>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-3 py-2.5 text-xs text-ink-dim">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-harbor-orange" />
            <span dangerouslySetInnerHTML={{ __html: t("apk_signing_warning") }} />
          </div>
        </section>

        {/* --- Step 2 ------------------------------------------------- */}
        <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
          <p className="font-display text-sm font-semibold text-ink">{t("apk_step2_title")}</p>
          <p className="mt-1 text-xs text-ink-dim">{t("apk_step2_desc")}</p>

          <div className="relative mt-3">
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={7}
              placeholder='[{"relation": [...], "target": {"namespace": "android_app", "package_name": "com.example.app", "sha256_cert_fingerprints": ["..."]}}]'
              className="w-full resize-none rounded-xl border border-base-border bg-base-bg px-3 py-2.5 font-mono text-xs text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              onClick={pasteFromClipboard}
              className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-base-surface2 px-2 py-1 text-[11px] text-ink-dim"
            >
              <ClipboardPaste size={12} /> {t("apk_paste_button")}
            </button>
          </div>

          {jsonInput.trim() && !parsed && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-accent-red">
              <XCircle size={13} /> {t("apk_parse_error")}
            </p>
          )}

          {parsed && (
            <div className="mt-3 flex flex-col gap-2">
              {parsed.targets.map((tgt, i) => (
                <div key={i} className="rounded-xl border border-accent-green/30 bg-accent-green/10 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-accent-green">
                    <CheckCircle2 size={13} /> {t("apk_parsed_ok")}
                  </p>
                  <p className="mt-1.5 truncate text-sm font-medium text-ink">{tgt.packageName}</p>
                  {tgt.fingerprints.map((fp) => (
                    <p key={fp} className="mt-0.5 break-all font-mono text-[10px] text-ink-faint">
                      {fp}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* --- Step 3 ------------------------------------------------- */}
        <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
          <p className="font-display text-sm font-semibold text-ink">{t("apk_step3_title")}</p>
          <p className="mt-1 text-xs text-ink-dim">{t("apk_step3_desc")}</p>

          <AuthGate next="/tools/harbor/apk">
            <div className="mt-3">
              {!parsed ? (
                <p className="text-xs text-ink-faint">{t("apk_step3_locked")}</p>
              ) : repoLoadError ? (
                <p className="text-xs text-accent-red">{repoLoadError}</p>
              ) : !repos ? (
                <p className="flex items-center gap-2 text-xs text-ink-dim">
                  <Loader2 size={14} className="animate-spin" /> {t("loading_repos")}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-ink-dim">{t("select_repo_label")}</label>
                  <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                    {repos.map((r) => (
                      <button
                        key={r.full_name}
                        onClick={() => pickRepo(r)}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition ${
                          selectedRepo?.full_name === r.full_name
                            ? "border-harbor-orange bg-harbor-orange/10"
                            : "border-base-border bg-base-bg"
                        }`}
                      >
                        <RepoIcon logoUrl={r.logoUrl} size={20} />
                        <span className="min-w-0 flex-1 truncate text-ink">{r.full_name}</span>
                      </button>
                    ))}
                  </div>

                  {selectedRepo && (
                    <>
                      <label className="mt-2 text-xs font-medium text-ink-dim">{t("apk_branch_label")}</label>
                      {!branches ? (
                        <p className="flex items-center gap-2 text-xs text-ink-dim">
                          <Loader2 size={13} className="animate-spin" /> {t("apk_loading_branches")}
                        </p>
                      ) : (
                        <select
                          value={selectedBranch ?? ""}
                          onChange={(e) => setSelectedBranch(e.target.value)}
                          className="rounded-lg border border-base-border bg-base-bg px-3 py-2 text-sm text-ink outline-none"
                        >
                          {branches.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      )}

                      <label className="mt-2 text-xs font-medium text-ink-dim">{t("apk_path_label")}</label>
                      <input
                        value={targetPath}
                        onChange={(e) => setTargetPath(e.target.value)}
                        className="rounded-lg border border-base-border bg-base-bg px-3 py-2 font-mono text-xs text-ink outline-none"
                      />

                      <button
                        onClick={pushToRepo}
                        disabled={pushing || !selectedBranch}
                        className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-harbor-orange px-4 py-2.5 text-sm font-medium text-white shadow-glow-orange transition active:scale-[0.99] disabled:opacity-50"
                      >
                        {pushing ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                        {t("apk_push_button")}
                      </button>

                      {pushError && <p className="text-xs text-accent-red">{pushError}</p>}
                      {pushResult && (
                        <a
                          href={pushResult.commitUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium text-accent-green underline"
                        >
                          <CheckCircle2 size={13} /> {t("apk_push_success")} <ExternalLink size={11} />
                        </a>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </AuthGate>
        </section>

        {/* --- Step 4 ------------------------------------------------- */}
        <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
          <p className="font-display text-sm font-semibold text-ink">{t("apk_step4_title")}</p>
          <p className="mt-1 text-xs text-ink-dim">{t("apk_step4_desc")}</p>

          <button
            onClick={verifyLive}
            disabled={!verifyUrl || !parsed || verifying}
            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-base-surface2 px-4 py-2.5 text-sm font-medium text-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            {verifying ? <Loader2 size={15} className="animate-spin" /> : null}
            {t("apk_verify_button")}
          </button>

          {verifyState === "match" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-green">
              <CheckCircle2 size={13} /> {t("apk_verify_match")}
            </p>
          )}
          {verifyState === "mismatch" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-red">
              <XCircle size={13} /> {t("apk_verify_mismatch")}
            </p>
          )}
          {verifyState === "unreachable" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-red">
              <XCircle size={13} /> {t("apk_verify_unreachable")} {verifyDetail ? `(${verifyDetail})` : ""}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
