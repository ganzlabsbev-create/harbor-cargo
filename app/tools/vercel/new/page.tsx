"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, CheckCircle2, ExternalLink, Loader2, Plus, Trash2, Rocket } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import RepoIcon from "@/components/RepoIcon";
import { useLang } from "@/lib/i18n-context";
import { useElapsedSeconds } from "@/lib/use-elapsed";
import { VERCEL_FRAMEWORKS } from "@/lib/vercel-frameworks";

interface RepoOption {
  name: string;
  full_name: string;
  default_branch: string;
  updated_at: string;
  language?: string | null;
  logoUrl?: string | null;
}

type Target = "production" | "preview" | "development";
interface EnvRow {
  key: string;
  value: string;
  targets: Target[];
}

const ALL_TARGETS: Target[] = ["production", "preview", "development"];

export default function VercelNewPage() {
  const { t } = useLang();

  // --- repo picker (same pattern as app/tools/github/update/page.tsx) ---
  const [repos, setRepos] = useState<RepoOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RepoOption | null>(null);
  const reposLoadElapsed = useElapsedSeconds(!repos && !loadError);

  useEffect(() => {
    fetch("/api/repos")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "load_failed");
        setRepos(data.repos);
      })
      .catch((err) => setLoadError(String(err?.message || err)));
  }, []);

  useEffect(() => {
    if (!repos || repos.length === 0) return;
    let cancelled = false;
    const BATCH_SIZE = 15;
    async function loadLogosProgressively() {
      for (let i = 0; i < repos!.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = repos!.slice(i, i + BATCH_SIZE).map((r) => {
          const [owner, name] = r.full_name.split("/");
          return { owner, name };
        });
        try {
          const res = await fetch("/api/repos/logos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ repos: batch }),
          });
          const data = await res.json();
          if (cancelled || !data.ok) continue;
          setRepos((prev) =>
            prev ? prev.map((r) => (r.full_name in data.logos ? { ...r, logoUrl: data.logos[r.full_name] } : r)) : prev
          );
        } catch {
          // move on to the next batch
        }
      }
    }
    loadLogosProgressively();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos === null]);

  // --- vercel connection ---
  const [vercelConnected, setVercelConnected] = useState<boolean | null>(null);
  const [vercelUsername, setVercelUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vercel/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setVercelConnected(data.connected);
          setVercelUsername(data.username);
        }
      })
      .catch(() => setVercelConnected(false));
  }, []);

  // --- form state, grouped to match the categorized sections in the UI ---
  const [projectName, setProjectName] = useState("");
  const [framework, setFramework] = useState<string | null>(null);
  const [branch, setBranch] = useState("");
  const [domain, setDomain] = useState("");
  const [rootDirectory, setRootDirectory] = useState("");
  const [buildCommand, setBuildCommand] = useState("");
  const [installCommand, setInstallCommand] = useState("");
  const [devCommand, setDevCommand] = useState("");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{ deploymentUrl: string | null; dashboardUrl: string; domainWarning: string | null } | null>(
    null
  );
  const createElapsed = useElapsedSeconds(creating);

  function selectRepo(r: RepoOption) {
    setSelected(r);
    setBranch(r.default_branch);
    setProjectName(r.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
  }

  function addEnvRow() {
    setEnvRows((prev) => [...prev, { key: "", value: "", targets: ["production", "preview", "development"] }]);
  }
  function updateEnvRow(i: number, patch: Partial<EnvRow>) {
    setEnvRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeEnvRow(i: number) {
    setEnvRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function toggleTarget(i: number, target: Target) {
    setEnvRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const has = row.targets.includes(target);
        return { ...row, targets: has ? row.targets.filter((tg) => tg !== target) : [...row.targets, target] };
      })
    );
  }

  async function handleCreate() {
    if (!selected || !projectName) return;
    setCreating(true);
    setError(null);
    setInstallUrl(null);
    try {
      const [owner, repo] = selected.full_name.split("/");
      const res = await fetch("/api/vercel/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branch: branch || undefined,
          name: projectName,
          framework,
          rootDirectory: rootDirectory || undefined,
          buildCommand: buildCommand || undefined,
          installCommand: installCommand || undefined,
          devCommand: devCommand || undefined,
          outputDirectory: outputDirectory || undefined,
          domain: domain || undefined,
          environmentVariables: envRows.filter((r) => r.key && r.targets.length > 0),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error === "github_app_not_installed" && data.installUrl) setInstallUrl(data.installUrl);
        throw new Error(data.error === "vercel_not_connected" ? t("error_vercel_not_connected") : data.detail || data.error);
      }
      setResult({ deploymentUrl: data.deploymentUrl, dashboardUrl: data.dashboardUrl, domainWarning: data.domainWarning });
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setCreating(false);
    }
  }

  const inputClass = "rounded-xl border border-base-border bg-base-surface px-4 py-3 text-ink outline-none focus:border-harbor-orange";
  const labelClass = "text-sm font-medium text-ink-dim";

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</p>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>
        <h1 className="mb-5 font-display text-xl font-bold tracking-tight text-ink">{t("vercel_back_title")}</h1>

        <AuthGate next="/tools/vercel/new">
        {result ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-8 text-center shadow-card">
            <CheckCircle2 size={40} className="text-accent-green" />
            <p className="font-display text-lg font-semibold text-ink">{t("deploy_success_title")}</p>
            {result.domainWarning && <p className="text-sm text-accent-red">{t("domain_warning_prefix")} {result.domainWarning}</p>}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {result.deploymentUrl && (
                <a
                  href={result.deploymentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl bg-harbor-orange px-5 py-3 font-medium text-white shadow-glow-orange"
                >
                  {t("view_deployment_button")} <ExternalLink size={16} />
                </a>
              )}
              <a
                href={result.dashboardUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface2 px-5 py-3 font-medium text-ink-dim"
              >
                {t("view_dashboard_button")} <ExternalLink size={16} />
              </a>
            </div>
          </div>
        ) : !selected ? (
          <div className="flex flex-col gap-3">
            <label className={labelClass}>{t("select_repo_for_vercel_label")}</label>
            {loadError ? (
              <p className="text-sm text-accent-red">{loadError}</p>
            ) : !repos ? (
              <p className="flex items-center gap-2 text-sm text-ink-dim">
                <Loader2 size={16} className="animate-spin" /> {t("loading_repos")}
                {reposLoadElapsed > 0 && <span className="text-ink-faint">({reposLoadElapsed}{t("seconds_short")})</span>}
              </p>
            ) : repos.length === 0 ? (
              <p className="text-sm text-ink-dim">{t("no_repos")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {repos.map((r) => (
                  <button
                    key={r.full_name}
                    onClick={() => selectRepo(r)}
                    className="flex items-center gap-3 rounded-xl border border-base-border bg-base-surface px-4 py-3 text-left text-sm text-ink transition active:scale-[0.99]"
                  >
                    <RepoIcon logoUrl={r.logoUrl} />
                    <span className="min-w-0 flex-1 truncate font-medium">{r.full_name}</span>
                    <span className="shrink-0 text-xs text-ink-faint">{r.default_branch}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : vercelConnected === false ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-8 text-center shadow-card">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-harbor-blue to-harbor-navy text-white shadow-glow-blue">
              <Rocket size={24} strokeWidth={1.75} />
            </div>
            <p className="font-display text-base font-semibold text-ink">{t("connect_vercel_title")}</p>
            <p className="text-sm text-ink-dim">{t("connect_vercel_desc")}</p>
            <a
              href="/api/auth/vercel"
              className="flex items-center gap-2 rounded-xl bg-black px-5 py-3 font-medium text-white"
            >
              {t("connect_vercel_button")}
            </a>
          </div>
        ) : vercelConnected === null ? (
          <p className="flex items-center gap-2 text-sm text-ink-dim">
            <Loader2 size={16} className="animate-spin" /> {t("loading_repos")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {vercelUsername && <p className="text-xs text-ink-faint">{t("vercel_connected_as").replace("{name}", vercelUsername)}</p>}

            <Section title={t("section_general")}>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>{t("vercel_project_name_label")}</span>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>{t("vercel_framework_label")}</span>
                <select
                  value={framework ?? ""}
                  onChange={(e) => setFramework(e.target.value || null)}
                  className={inputClass}
                >
                  {VERCEL_FRAMEWORKS.map((f) => (
                    <option key={f.label} value={f.value ?? ""}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </Section>

            <Section title={t("section_git")}>
              <div className="flex items-center gap-3 rounded-xl border border-base-border bg-base-surface2 px-4 py-3">
                <RepoIcon logoUrl={selected.logoUrl} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{selected.full_name}</span>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>{t("vercel_git_branch_label")}</span>
                <input value={branch} onChange={(e) => setBranch(e.target.value)} className={inputClass} />
              </label>
            </Section>

            <Section title={t("section_domain")}>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>{t("vercel_domain_label")}</span>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder={t("vercel_domain_placeholder")}
                  className={inputClass}
                />
                <span className="text-[11px] text-ink-faint">{t("vercel_domain_hint")}</span>
              </label>
            </Section>

            <Section title={t("section_build")}>
              {[
                { label: t("vercel_root_directory_label"), val: rootDirectory, set: setRootDirectory },
                { label: t("vercel_build_command_label"), val: buildCommand, set: setBuildCommand },
                { label: t("vercel_install_command_label"), val: installCommand, set: setInstallCommand },
                { label: t("vercel_dev_command_label"), val: devCommand, set: setDevCommand },
                { label: t("vercel_output_directory_label"), val: outputDirectory, set: setOutputDirectory },
              ].map((f) => (
                <label key={f.label} className="flex flex-col gap-1.5">
                  <span className={labelClass}>{f.label}</span>
                  <input
                    value={f.val}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={t("vercel_auto_placeholder")}
                    className={inputClass}
                  />
                </label>
              ))}
            </Section>

            <Section title={t("section_env")}>
              {envRows.map((row, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-base-border bg-base-surface2 p-3">
                  <div className="flex gap-2">
                    <input
                      value={row.key}
                      onChange={(e) => updateEnvRow(i, { key: e.target.value })}
                      placeholder={t("env_key_placeholder")}
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      value={row.value}
                      onChange={(e) => updateEnvRow(i, { value: e.target.value })}
                      placeholder={t("env_value_placeholder")}
                      type="password"
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      onClick={() => removeEnvRow(i)}
                      aria-label="remove"
                      className="flex shrink-0 items-center justify-center rounded-xl border border-base-border px-3 text-accent-red"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_TARGETS.map((tg) => (
                      <button
                        key={tg}
                        onClick={() => toggleTarget(i, tg)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                          row.targets.includes(tg)
                            ? "bg-harbor-orange/10 text-harbor-orange"
                            : "bg-base-surface text-ink-faint"
                        }`}
                      >
                        {t(`env_target_${tg}` as any)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={addEnvRow}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-base-border py-2.5 text-sm font-medium text-ink-dim"
              >
                <Plus size={15} /> {t("env_add_button")}
              </button>
            </Section>

            {error && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-accent-red">{error}</p>
                {installUrl && (
                  <a
                    href={installUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-medium text-white"
                  >
                    {t("install_vercel_github_app_button")} <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={creating || !projectName}
              className="flex items-center justify-center gap-2 rounded-xl bg-harbor-orange px-5 py-3.5 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> {t("creating_project")}
                  {createElapsed > 0 && <span className="opacity-80">({createElapsed}{t("seconds_short")})</span>}
                </>
              ) : (
                t("create_deploy_button")
              )}
            </button>
          </div>
        )}
        </AuthGate>
      </div>
    </main>
  );
}
