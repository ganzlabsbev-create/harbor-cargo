"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Menu,
  X,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  RefreshCcw,
  GitBranch,
  ArrowUpCircle,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import { useLang } from "@/lib/i18n-context";
import { VERCEL_FRAMEWORKS } from "@/lib/vercel-frameworks";
import { addRecent, removeRecent } from "@/lib/recents";
import { useRouteTransition } from "@/lib/route-transition";

type Section = "overview" | "env" | "domains" | "build" | "git" | "deployments" | "danger";

interface ProjectDetail {
  id: string;
  name: string;
  framework: string | null;
  rootDirectory: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  devCommand: string | null;
  outputDirectory: string | null;
  gitRepo: string | null;
  productionBranch: string | null;
  liveUrl: string | null;
  latestDeployment: { id: string; url: string; state: string; target: string | null; createdAt: number } | null;
}

type Target = "production" | "preview" | "development";
interface EnvVar {
  id: string;
  key: string;
  value: string | null;
  target: Target[];
}
interface Domain {
  name: string;
  verified: boolean;
}
interface Deployment {
  id: string;
  url: string;
  state: string;
  target: string | null;
  createdAt: number;
}

const ALL_TARGETS: Target[] = ["production", "preview", "development"];

interface DeployError {
  deploymentId: string;
  message: string;
  code: string | null;
}

/** Color-codes a deployment state badge — READY green, ERROR/CANCELED red, anything else (BUILDING/QUEUED/INITIALIZING) orange/in-progress. */
function stateBadgeClass(state: string | null | undefined): string {
  const s = (state || "").toUpperCase();
  if (s === "READY") return "bg-accent-green/10 text-accent-green";
  if (s === "ERROR" || s === "CANCELED") return "bg-accent-red/10 text-accent-red";
  return "bg-harbor-orange/10 text-harbor-orange";
}

export default function VercelProjectDashboard({ params }: { params: { projectId: string } }) {
  const { t } = useLang();
  const router = useRouter();
  const projectId = params.projectId;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  // Two distinct quick actions, kept at this level (not inside
  // DeploymentsSection) so they're reachable from every section, not just
  // buried behind the ☰ menu:
  // - deployFromGit: forces Vercel to pull the LATEST commit from GitHub
  //   right now and deploy it — the fix for "I pushed new files but Vercel
  //   hasn't picked them up yet".
  // - rebuildLatest: rebuilds the existing latest deployment from the SAME
  //   commit it already used — useful when a build just failed transiently
  //   and you want to retry without new code.
  const [gitDeploying, setGitDeploying] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Failure details for the project's latest deployment, if it's currently
  // in an ERROR/CANCELED state. Rendered as a bottom bar that only appears
  // when there's actually something to show.
  const [deployError, setDeployError] = useState<DeployError | null>(null);

  async function refreshProject() {
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}`);
      const data = await res.json();
      if (!data.ok) {
        const err: any = new Error(data.detail || data.error || "load_failed");
        err.status = res.status;
        throw err;
      }
      setProject(data.project);
      // Home page "Recent" row — localStorage only, see lib/recents.ts.
      addRecent({
        id: `vercel-manage:${projectId}`,
        type: "vercel-manage",
        label: data.project.name,
        sublabel: data.project.framework || undefined,
        href: `/tools/vercel/manage/${projectId}`,
      });
      await refreshDeployError(data.project.latestDeployment);
    } catch (err: any) {
      setLoadError(String(err?.message || err));
      // Project gone (deleted) or no longer accessible (403) — this recent
      // entry is dead, drop it and bounce back to the project picker rather
      // than leaving the user stuck on a page that can never load.
      if (err?.status === 404 || err?.status === 403) {
        removeRecent(`vercel-manage:${projectId}`);
        router.replace("/tools/vercel/manage");
      }
    }
  }

  async function refreshDeployError(latestDeployment: ProjectDetail["latestDeployment"]) {
    const state = (latestDeployment?.state || "").toUpperCase();
    if (!latestDeployment || (state !== "ERROR" && state !== "CANCELED")) {
      setDeployError(null);
      return;
    }
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/deployments/${latestDeployment.id}/error`);
      const data = await res.json();
      if (data.ok && data.deployError) setDeployError(data.deployError);
      else setDeployError(null);
    } catch {
      // Couldn't fetch the detailed reason — not worth blocking the page over.
    }
  }

  useEffect(() => {
    refreshProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Poll while the latest deployment is still in progress, so a build that
  // fails *after* this page has already loaded still surfaces its error
  // automatically — without this, refreshProject() only ever ran once on
  // mount (or after tapping Deploy/Rebuild), so a failure that happened in
  // between just silently sat there until the next manual reload.
  const pendingState = (project?.latestDeployment?.state || "").toUpperCase();
  const isDeploymentPending = ["BUILDING", "QUEUED", "INITIALIZING"].includes(pendingState);
  useEffect(() => {
    if (!isDeploymentPending) return;
    const id = window.setInterval(() => {
      refreshProject();
    }, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDeploymentPending, projectId]);

  async function handleDeployFromGit() {
    if (!window.confirm(t("deploy_from_git_confirm"))) return;
    setGitDeploying(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/deployments/git-deploy`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setActionMsg(t("deploy_from_git_started"));
      await refreshProject();
    } catch (err: any) {
      setActionMsg(String(err?.message || err));
    } finally {
      setGitDeploying(false);
    }
  }

  async function handleRebuildLatest() {
    setRebuilding(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/deployments/redeploy`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setActionMsg(t("redeploy_started"));
      await refreshProject();
    } catch (err: any) {
      setActionMsg(String(err?.message || err));
    } finally {
      setRebuilding(false);
    }
  }

  const inputClass = "rounded-xl border border-base-border bg-base-surface px-4 py-3 text-ink outline-none focus:border-harbor-orange";
  const labelClass = "text-sm font-medium text-ink-dim";

  const MENU_ITEMS: { key: Section; label: string }[] = [
    { key: "overview", label: t("menu_overview") },
    { key: "env", label: t("menu_env") },
    { key: "domains", label: t("menu_domains") },
    { key: "build", label: t("menu_build") },
    { key: "git", label: t("menu_git") },
    { key: "deployments", label: t("menu_deployments") },
    { key: "danger", label: t("menu_danger") },
  ];

  return (
    <main className="min-h-dvh bg-base-bg pb-24">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6 md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        <Link href="/tools/vercel/manage" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <AuthGate next={`/tools/vercel/manage/${projectId}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h1 className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-ink">
            {project?.name || "..."}
          </h1>
          {/* This menu belongs to this page only — it is NOT the app's main header/nav. */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t("vercel_menu_label")}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-base-border bg-base-surface text-ink"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 z-10 w-56 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
                {MENU_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      setSection(item.key);
                      setMenuOpen(false);
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-sm transition ${
                      section === item.key ? "bg-harbor-orange/10 font-medium text-harbor-orange" : "text-ink-dim hover:bg-base-surface2"
                    } ${item.key === "danger" ? "border-t border-base-border text-accent-red" : ""}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick deploy action — only shown on the overview (landing) section.
            Just the one button that pulls the latest commit from GitHub;
            the rebuild-from-same-source button lives only in the
            Deployments section now, so it doesn't show up on every tab. */}
        {section === "overview" && (
          <>
            <div className="mb-1 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleDeployFromGit}
                disabled={gitDeploying || !project}
                title={t("deploy_from_git_hint")}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-harbor-orange px-4 py-2.5 text-sm font-semibold text-white shadow-glow-orange disabled:opacity-50"
              >
                {gitDeploying ? <Loader2 size={16} className="animate-spin" /> : <GitBranch size={16} />}
                {t("deploy_from_git_button")}
              </button>
            </div>
            {actionMsg ? (
              <p className="mb-4 text-xs text-ink-dim">{actionMsg}</p>
            ) : (
              <p className="mb-4 text-[11px] text-ink-faint">{t("deploy_from_git_hint")}</p>
            )}
          </>
        )}

        {loadError ? (
          <p className="text-sm text-accent-red">{loadError}</p>
        ) : !project ? (
          <p className="flex items-center gap-2 text-sm text-ink-dim">
            <Loader2 size={16} className="animate-spin" /> {t("loading_vercel_projects")}
          </p>
        ) : (
          <>
            {section === "overview" && <OverviewSection project={project} t={t} />}
            {section === "env" && <EnvSection projectId={projectId} t={t} inputClass={inputClass} />}
            {section === "domains" && <DomainsSection projectId={projectId} t={t} inputClass={inputClass} />}
            {section === "build" && (
              <BuildSection projectId={projectId} project={project} setProject={setProject} t={t} inputClass={inputClass} labelClass={labelClass} />
            )}
            {section === "git" && (
              <GitSection projectId={projectId} project={project} setProject={setProject} t={t} inputClass={inputClass} labelClass={labelClass} />
            )}
            {section === "deployments" && (
              <DeploymentsSection
                projectId={projectId}
                t={t}
                onDeployFromGit={handleDeployFromGit}
                gitDeploying={gitDeploying}
                onRebuildLatest={handleRebuildLatest}
                rebuilding={rebuilding}
                actionMsg={actionMsg}
              />
            )}
            {section === "danger" && <DangerSection projectId={projectId} project={project} t={t} inputClass={inputClass} router={router} />}

            {/* Deployment error — always inline at the very bottom of the
                page content (not a tap-to-expand overlay), so it's visible
                immediately without an extra step. */}
            <DeployErrorCard deployError={deployError} t={t} />
          </>
        )}
        </AuthGate>
      </div>
    </main>
  );
}

/**
 * Inline card shown at the bottom of the page whenever the project's
 * latest deployment is currently ERROR/CANCELED — full error text plus a
 * one-tap copy button, so there's no need to open the Vercel dashboard
 * just to read why a deploy failed.
 */
function DeployErrorCard({ deployError, t }: { deployError: DeployError | null; t: (k: any) => string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [deployError?.deploymentId, deployError?.message]);

  if (!deployError) return null;

  async function copyError() {
    try {
      await navigator.clipboard.writeText(deployError!.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — nothing more we can do here
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-accent-red/30 bg-accent-red/5 p-4">
      <div className="flex items-center gap-2 text-accent-red">
        <AlertTriangle size={18} />
        <h2 className="font-display text-base font-semibold">{t("deployment_error_title")}</h2>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl bg-base-surface2 p-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-ink-dim">{deployError.message}</pre>
      </div>
      <button
        onClick={copyError}
        className="flex items-center justify-center gap-2 rounded-xl border border-base-border bg-base-surface px-4 py-2.5 text-sm font-medium text-ink-dim active:scale-[0.99]"
      >
        {copied ? <Check size={15} className="text-accent-green" /> : <Copy size={15} />}
        {copied ? t("deployment_error_copied") : t("deployment_error_copy_button")}
      </button>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">{children}</div>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-base-border py-2.5 last:border-0">
      <span className="text-sm text-ink-faint">{label}</span>
      <span className="min-w-0 truncate text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

function OverviewSection({ project, t }: { project: ProjectDetail; t: (k: any) => string }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Row label={t("vercel_project_name_label")} value={project.name} />
        <Row label={t("overview_framework_label")} value={project.framework || "—"} />
        <Row label={t("overview_repo_label")} value={project.gitRepo || "—"} />
        <Row
          label={t("overview_live_url_label")}
          value={
            project.liveUrl ? (
              <a href={project.liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-harbor-blue">
                {project.liveUrl.replace(/^https?:\/\//, "")} <ExternalLink size={12} />
              </a>
            ) : (
              "—"
            )
          }
        />
      </Card>
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{t("overview_latest_deployment_label")}</p>
        {project.latestDeployment ? (
          <a
            href={project.latestDeployment.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 rounded-xl border border-base-border bg-base-surface2 px-4 py-3"
          >
            <span className="min-w-0 truncate text-sm text-ink">{project.latestDeployment.url.replace(/^https?:\/\//, "")}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${stateBadgeClass(project.latestDeployment.state)}`}>
              {project.latestDeployment.state}
            </span>
          </a>
        ) : (
          <p className="text-sm text-ink-dim">{t("overview_no_deployment")}</p>
        )}
      </Card>
    </div>
  );
}

function EnvSection({ projectId, t, inputClass }: { projectId: string; t: (k: any) => string; inputClass: string }) {
  const [envs, setEnvs] = useState<EnvVar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ key: string; value: string; targets: Target[] }>({ key: "", value: "", targets: [...ALL_TARGETS] });
  const [pendingValues, setPendingValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function load() {
    fetch(`/api/vercel/projects/${projectId}/env`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.detail || data.error);
        setEnvs(data.envs);
      })
      .catch((err) => setError(String(err?.message || err)));
  }
  useEffect(load, [projectId]);

  async function addVar() {
    if (!draft.key || draft.targets.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/env`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setDraft({ key: "", value: "", targets: [...ALL_TARGETS] });
      load();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setAdding(false);
    }
  }

  async function saveVar(env: EnvVar) {
    const newValue = pendingValues[env.id];
    if (!newValue) return;
    setSavingId(env.id);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/env/${env.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: newValue }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setPendingValues((p) => ({ ...p, [env.id]: "" }));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSavingId(null);
    }
  }

  async function removeVar(env: EnvVar) {
    if (!window.confirm(t("env_delete_confirm_title"))) return;
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/env/${env.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setEnvs((prev) => prev?.filter((e) => e.id !== env.id) ?? prev);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-accent-red">{error}</p>}

      <Card>
        {envs === null ? (
          <p className="flex items-center gap-2 text-sm text-ink-dim">
            <Loader2 size={16} className="animate-spin" /> {t("loading_vercel_projects")}
          </p>
        ) : envs.length === 0 ? (
          <p className="text-sm text-ink-dim">{t("env_list_empty")}</p>
        ) : (
          envs.map((env) => (
            <div key={env.id} className="flex flex-col gap-2 rounded-xl border border-base-border bg-base-surface2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm font-medium text-ink">{env.key}</span>
                <button onClick={() => removeVar(env)} aria-label="remove" className="shrink-0 text-accent-red">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {env.target.map((tg) => (
                  <span key={tg} className="rounded-lg bg-base-surface px-2 py-0.5 text-xs text-ink-faint">
                    {t(`env_target_${tg}` as any)}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={pendingValues[env.id] ?? ""}
                  onChange={(e) => setPendingValues((p) => ({ ...p, [env.id]: e.target.value }))}
                  placeholder="••••••••"
                  type="password"
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <button
                  onClick={() => saveVar(env)}
                  disabled={savingId === env.id || !pendingValues[env.id]}
                  className="shrink-0 rounded-xl bg-harbor-orange px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingId === env.id ? <Loader2 size={14} className="animate-spin" /> : t("env_save_button")}
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{t("env_add_button")}</p>
        <div className="flex flex-col gap-2">
          <input
            value={draft.key}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
            placeholder={t("env_key_placeholder")}
            className={`${inputClass} w-full`}
          />
          <input
            value={draft.value}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
            placeholder={t("env_value_placeholder")}
            type="password"
            className={`${inputClass} w-full`}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TARGETS.map((tg) => (
            <button
              key={tg}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  targets: d.targets.includes(tg) ? d.targets.filter((x) => x !== tg) : [...d.targets, tg],
                }))
              }
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                draft.targets.includes(tg) ? "bg-harbor-orange/10 text-harbor-orange" : "bg-base-surface2 text-ink-faint"
              }`}
            >
              {t(`env_target_${tg}` as any)}
            </button>
          ))}
        </div>
        <button
          onClick={addVar}
          disabled={adding || !draft.key || draft.targets.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-base-border py-2.5 text-sm font-medium text-ink-dim disabled:opacity-50"
        >
          {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {t("env_add_button")}
        </button>
      </Card>
    </div>
  );
}

function DomainsSection({ projectId, t, inputClass }: { projectId: string; t: (k: any) => string; inputClass: string }) {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch(`/api/vercel/projects/${projectId}/domains`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.detail || data.error);
        setDomains(data.domains);
      })
      .catch((err) => setError(String(err?.message || err)));
  }
  useEffect(load, [projectId]);

  async function addDomain() {
    if (!newDomain) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setNewDomain("");
      load();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setAdding(false);
    }
  }

  async function removeDomainRow(name: string) {
    if (!window.confirm(t("domain_remove_confirm"))) return;
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/domains/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setDomains((prev) => prev?.filter((d) => d.name !== name) ?? prev);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <Card>
        {domains === null ? (
          <p className="flex items-center gap-2 text-sm text-ink-dim">
            <Loader2 size={16} className="animate-spin" /> {t("loading_vercel_projects")}
          </p>
        ) : domains.length === 0 ? (
          <p className="text-sm text-ink-dim">{t("domains_empty")}</p>
        ) : (
          domains.map((d) => (
            <div key={d.name} className="flex items-center justify-between gap-2 rounded-xl border border-base-border bg-base-surface2 px-4 py-3">
              <span className="min-w-0 truncate text-sm text-ink">{d.name}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${d.verified ? "bg-accent-green/10 text-accent-green" : "bg-harbor-orange/10 text-harbor-orange"}`}>
                  {d.verified ? "✓" : "…"}
                </span>
                <button onClick={() => removeDomainRow(d.name)} aria-label="remove" className="text-accent-red">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </Card>
      <Card>
        <div className="flex gap-2">
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder={t("domain_add_placeholder")}
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button
            onClick={addDomain}
            disabled={adding || !newDomain}
            className="shrink-0 rounded-xl bg-harbor-orange px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : t("domain_add_button")}
          </button>
        </div>
      </Card>
    </div>
  );
}

function BuildSection({
  projectId,
  project,
  setProject,
  t,
  inputClass,
  labelClass,
}: {
  projectId: string;
  project: ProjectDetail;
  setProject: (p: ProjectDetail) => void;
  t: (k: any) => string;
  inputClass: string;
  labelClass: string;
}) {
  const [framework, setFramework] = useState(project.framework ?? "");
  const [rootDirectory, setRootDirectory] = useState(project.rootDirectory ?? "");
  const [buildCommand, setBuildCommand] = useState(project.buildCommand ?? "");
  const [installCommand, setInstallCommand] = useState(project.installCommand ?? "");
  const [devCommand, setDevCommand] = useState(project.devCommand ?? "");
  const [outputDirectory, setOutputDirectory] = useState(project.outputDirectory ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framework: framework || null,
          rootDirectory: rootDirectory || null,
          buildCommand: buildCommand || null,
          installCommand: installCommand || null,
          devCommand: devCommand || null,
          outputDirectory: outputDirectory || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setProject(data.project);
      setSaved(true);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("vercel_framework_label")}</span>
        <select value={framework} onChange={(e) => setFramework(e.target.value)} className={inputClass}>
          {VERCEL_FRAMEWORKS.map((f) => (
            <option key={f.label} value={f.value ?? ""}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {[
        { label: t("vercel_root_directory_label"), val: rootDirectory, set: setRootDirectory },
        { label: t("vercel_build_command_label"), val: buildCommand, set: setBuildCommand },
        { label: t("vercel_install_command_label"), val: installCommand, set: setInstallCommand },
        { label: t("vercel_dev_command_label"), val: devCommand, set: setDevCommand },
        { label: t("vercel_output_directory_label"), val: outputDirectory, set: setOutputDirectory },
      ].map((f) => (
        <label key={f.label} className="flex flex-col gap-1.5">
          <span className={labelClass}>{f.label}</span>
          <input value={f.val} onChange={(e) => f.set(e.target.value)} placeholder={t("vercel_auto_placeholder")} className={inputClass} />
        </label>
      ))}
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center justify-center gap-2 rounded-xl bg-harbor-orange px-5 py-3 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? t("build_saved") : t("build_save_button")}
      </button>
    </Card>
  );
}

function GitSection({
  projectId,
  project,
  setProject,
  t,
  inputClass,
  labelClass,
}: {
  projectId: string;
  project: ProjectDetail;
  setProject: (p: ProjectDetail) => void;
  t: (k: any) => string;
  inputClass: string;
  labelClass: string;
}) {
  const [branch, setBranch] = useState(project.productionBranch ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!branch) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionBranch: branch }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setProject(data.project);
      setSaved(true);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("vercel_git_repo_label")}</span>
        <div className="rounded-xl border border-base-border bg-base-surface2 px-4 py-3 text-sm text-ink-dim">{project.gitRepo || "—"}</div>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("git_production_branch_label")}</span>
        <input value={branch} onChange={(e) => setBranch(e.target.value)} className={inputClass} />
      </label>
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <button
        onClick={save}
        disabled={saving || !branch}
        className="flex items-center justify-center gap-2 rounded-xl bg-harbor-orange px-5 py-3 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? t("build_saved") : t("git_save_button")}
      </button>
    </Card>
  );
}

function DeploymentsSection({
  projectId,
  t,
  onDeployFromGit,
  gitDeploying,
  onRebuildLatest,
  rebuilding,
  actionMsg,
}: {
  projectId: string;
  t: (k: any) => string;
  onDeployFromGit: () => void;
  gitDeploying: boolean;
  onRebuildLatest: () => void;
  rebuilding: boolean;
  actionMsg: string | null;
}) {
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  function load() {
    fetch(`/api/vercel/projects/${projectId}/deployments`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.detail || data.error);
        setDeployments(data.deployments);
      })
      .catch((err) => setError(String(err?.message || err)));
  }
  useEffect(load, [projectId]);

  async function promote(deploymentId: string) {
    setPromotingId(deploymentId);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/deployments/${deploymentId}/promote`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      load();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setPromotingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-accent-red">{error}</p>}
      {/* This section keeps both quick actions: pull the latest commit from
          GitHub (asks for confirmation first, since it fetches new code),
          and rebuild the existing latest deployment from the same source. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => {
            onDeployFromGit();
            setTimeout(load, 1500);
          }}
          disabled={gitDeploying}
          title={t("deploy_from_git_hint")}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-harbor-orange px-5 py-3 font-display font-semibold text-white shadow-glow-orange disabled:opacity-50"
        >
          {gitDeploying ? (
            <>
              <Loader2 size={16} className="animate-spin" /> {t("deploy_from_git_running")}
            </>
          ) : (
            <>
              <GitBranch size={16} /> {t("deploy_from_git_button")}
            </>
          )}
        </button>
        <button
          onClick={() => {
            onRebuildLatest();
            setTimeout(load, 1500);
          }}
          disabled={rebuilding}
          title={t("redeploy_rebuild_hint")}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-base-border bg-base-surface px-5 py-3 font-display font-semibold text-ink-dim disabled:opacity-50"
        >
          {rebuilding ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
          {t("redeploy_rebuild_button")}
        </button>
      </div>
      {actionMsg && <p className="text-xs text-ink-dim">{actionMsg}</p>}

      <Card>
        {deployments === null ? (
          <p className="flex items-center gap-2 text-sm text-ink-dim">
            <Loader2 size={16} className="animate-spin" /> {t("loading_vercel_projects")}
          </p>
        ) : deployments.length === 0 ? (
          <p className="text-sm text-ink-dim">{t("deployments_empty")}</p>
        ) : (
          deployments.map((d) => (
            <div key={d.id} className="flex flex-col gap-2 rounded-xl border border-base-border bg-base-surface2 p-3">
              <div className="flex items-center justify-between gap-2">
                <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm text-harbor-blue">
                  {d.url.replace(/^https?:\/\//, "")}
                </a>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${stateBadgeClass(d.state)}`}>{d.state}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-faint">{d.target || "preview"}</span>
                {d.target !== "production" && (
                  <button
                    onClick={() => promote(d.id)}
                    disabled={promotingId === d.id}
                    className="flex items-center gap-1 text-xs font-medium text-harbor-blue disabled:opacity-50"
                  >
                    {promotingId === d.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpCircle size={12} />}
                    {t("deployment_promote_button")}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function DangerSection({
  projectId,
  project,
  t,
  inputClass,
  router,
}: {
  projectId: string;
  project: ProjectDetail;
  t: (k: any) => string;
  inputClass: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = confirmName === project.name;
  const { start: startRouteTransition } = useRouteTransition();

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      startRouteTransition();
      router.push("/tools/vercel/manage");
    } catch (err: any) {
      setError(String(err?.message || err));
      setDeleting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-2 rounded-xl bg-accent-red/10 p-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-accent-red" />
        <p className="text-sm text-accent-red">{t("danger_zone_warning")}</p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-dim">
          {t("danger_zone_confirm_label")} (<span className="font-mono">{project.name}</span>)
        </span>
        <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} className={inputClass} />
      </label>
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <button
        onClick={handleDelete}
        disabled={!canDelete || deleting}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent-red px-5 py-3 font-display font-semibold text-white disabled:opacity-50"
      >
        {deleting ? (
          <>
            <Loader2 size={16} className="animate-spin" /> {t("deleting_project")}
          </>
        ) : (
          <>
            <Trash2 size={16} /> {t("delete_project_button")}
          </>
        )}
      </button>
    </Card>
  );
}
