/**
 * Vercel API helpers for the "deploy from an existing GitHub repo" flow.
 * Mirrors lib/github.ts in shape (a thin fetch wrapper + friendly errors).
 * The Vercel access token comes from the user's own OAuth connection (see
 * app/api/auth/vercel) — never a shared/static token, and never persisted
 * outside the encrypted session cookie (lib/session.ts).
 */

const API = "https://api.vercel.com";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export class VercelApiError extends Error {
  status: number;
  code: string;
  /** Set only for the "Vercel can't see this repo yet" case — see vc() below. */
  installUrl?: string;
  constructor(status: number, code: string, message: string, installUrl?: string) {
    super(message);
    this.name = "VercelApiError";
    this.status = status;
    this.code = code;
    this.installUrl = installUrl;
  }
}

function friendlyVercelError(status: number, pathname: string, rawText: string): VercelApiError {
  let vercelCode = "";
  let vercelMessage = "";
  try {
    const parsed = JSON.parse(rawText);
    vercelCode = parsed?.error?.code || "";
    vercelMessage = parsed?.error?.message || "";
  } catch {
    // response wasn't JSON — ignore, fall back to generic messages below
  }

  if (status === 401) {
    return new VercelApiError(status, "vercel_auth_expired", "Your Vercel connection has expired. Please connect again.");
  }
  // Vercel returns this when its own GitHub App hasn't been granted access
  // to the repo yet — this is a real, unavoidable one-time step (see
  // lib/vercel.ts createProjectFromRepo doc comment), so we surface a
  // direct link to fix it rather than a generic error.
  if (status === 403 && /git.*(not.*connect|no.*access|forbidden)/i.test(vercelMessage + vercelCode)) {
    return new VercelApiError(
      status,
      "github_app_not_installed",
      "Vercel doesn't have access to this GitHub repo yet.",
      "https://github.com/apps/vercel/installations/new"
    );
  }
  if (status === 403) {
    return new VercelApiError(status, "vercel_forbidden", "Vercel denied this action for your account/team.");
  }
  if (status === 404 && /reposit|git.*not.*found/i.test(vercelMessage + vercelCode)) {
    return new VercelApiError(
      status,
      "github_app_not_installed",
      "Vercel can't find that repo — it likely doesn't have access yet.",
      "https://github.com/apps/vercel/installations/new"
    );
  }
  if (status === 409 && /already exists/i.test(vercelMessage)) {
    return new VercelApiError(status, "vercel_name_taken", "A Vercel project with that name already exists.");
  }
  if (status === 429) {
    return new VercelApiError(status, "vercel_rate_limited", "Too many requests to Vercel right now. Please wait a moment and try again.");
  }
  if (status >= 500) {
    return new VercelApiError(status, "vercel_server_error", "Vercel is having issues right now. Please try again shortly.");
  }
  return new VercelApiError(status, "vercel_error", vercelMessage || `Vercel API error (${pathname}): ${status}`);
}

async function vc(token: string, pathname: string, init?: RequestInit) {
  const res = await fetch(`${API}${pathname}`, { ...init, headers: headers(token) });
  if (!res.ok) {
    const text = await res.text();
    throw friendlyVercelError(res.status, pathname, text);
  }
  return res.json();
}

/** Appends ?teamId=... when the session is connected on behalf of a team. */
function withTeam(pathname: string, teamId?: string | null): string {
  if (!teamId) return pathname;
  const sep = pathname.includes("?") ? "&" : "?";
  return `${pathname}${sep}teamId=${encodeURIComponent(teamId)}`;
}

export async function getAuthenticatedVercelUser(token: string): Promise<{ username: string; name?: string; email?: string }> {
  const data = await vc(token, "/v2/user");
  return { username: data.user?.username, name: data.user?.name, email: data.user?.email };
}

// A conservative, hand-picked list of Vercel's built-in framework presets —
// covers everything lib/framework-detect.ts can already identify. Kept as
// a static list rather than a live API call since Vercel doesn't expose a
// simple public "list frameworks" endpoint; this only affects the default
// build settings Vercel pre-fills, and can always be overridden manually
// in the Build & Development Settings section.
export { VERCEL_FRAMEWORKS } from "./vercel-frameworks";

export interface EnvVarInput {
  key: string;
  value: string;
  targets: Array<"production" | "preview" | "development">;
}

export interface CreateProjectInput {
  name: string;
  owner: string;
  repo: string;
  productionBranch?: string;
  framework?: string | null;
  rootDirectory?: string | null;
  buildCommand?: string | null;
  installCommand?: string | null;
  devCommand?: string | null;
  outputDirectory?: string | null;
  environmentVariables?: EnvVarInput[];
}

export interface VercelProject {
  id: string;
  name: string;
  /** Dashboard URL for the project. */
  dashboardUrl: string;
  /** Live URL of the most recent production deployment, once one exists. */
  deploymentUrl: string | null;
  /** id of that same deployment, if any — lets the caller poll its status. */
  deploymentId: string | null;
}

/**
 * Creates a Vercel project wired directly to an existing GitHub repo
 * (git-based deploys — no zip upload). Everything except the repo link
 * itself (name, framework, build settings, env vars) is filled in from
 * the "General" / "Build & Development Settings" / "Environment
 * Variables" sections of the create-project form.
 *
 * REQUIRES that Vercel's own GitHub App already has access to the repo.
 * That's a one-time GitHub consent screen that only GitHub can present —
 * it can't be done purely over this API. If it's missing, Vercel responds
 * with a 403/404 that friendlyVercelError() turns into a
 * "github_app_not_installed" error carrying installUrl, which the UI uses
 * to send the user to https://github.com/apps/vercel/installations/new.
 */
export async function createProjectFromRepo(token: string, input: CreateProjectInput, teamId?: string | null): Promise<VercelProject> {
  const body: Record<string, any> = {
    name: input.name,
    gitRepository: { type: "github", repo: `${input.owner}/${input.repo}` },
  };
  if (input.productionBranch) body.gitRepository.productionBranch = input.productionBranch;
  if (input.framework !== undefined) body.framework = input.framework;
  if (input.rootDirectory) body.rootDirectory = input.rootDirectory;
  if (input.buildCommand) body.buildCommand = input.buildCommand;
  if (input.installCommand) body.installCommand = input.installCommand;
  if (input.devCommand) body.devCommand = input.devCommand;
  if (input.outputDirectory) body.outputDirectory = input.outputDirectory;
  if (input.environmentVariables?.length) {
    body.environmentVariables = input.environmentVariables.map((e) => ({
      key: e.key,
      value: e.value,
      type: "encrypted",
      target: e.targets,
    }));
  }

  const data = await vc(token, withTeam("/v11/projects", teamId), {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    id: data.id,
    name: data.name,
    // Vercel's actual project URL needs the team/user slug, which this API
    // response doesn't include — link to the dashboard root rather than
    // guess a slug and risk a broken deep link.
    dashboardUrl: "https://vercel.com/dashboard",
    deploymentUrl: data.latestDeployments?.[0]?.url ? `https://${data.latestDeployments[0].url}` : null,
    deploymentId: data.latestDeployments?.[0]?.id ?? null,
  };
}

/** Adds a custom domain to an already-created project. */
export async function addProjectDomain(token: string, projectId: string, domain: string, teamId?: string | null): Promise<void> {
  await vc(token, withTeam(`/v10/projects/${projectId}/domains`, teamId), {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
}

/** Polls the project once for its latest deployment (used right after create, since the first deployment can take a few seconds to register). */
export async function getLatestDeployment(
  token: string,
  projectId: string,
  teamId?: string | null
): Promise<{ url: string | null; id: string | null }> {
  try {
    const data = await vc(token, withTeam(`/v9/projects/${projectId}`, teamId));
    const url = data?.latestDeployments?.[0]?.url;
    const id = data?.latestDeployments?.[0]?.id;
    return { url: url ? `https://${url}` : null, id: id ?? null };
  } catch {
    return { url: null, id: null };
  }
}

/* -------------------------------------------------------------------------
 * Managing an existing project (v0.11.0) — everything below this line is
 * for app/tools/vercel/manage/*, letting a user edit a Vercel project
 * Harbor Cargo didn't necessarily create itself. Kept in the same file as
 * the create-project helpers above since it's the same thin fetch-wrapper
 * pattern against the same API.
 * ---------------------------------------------------------------------- */

export interface VercelProjectSummary {
  id: string;
  name: string;
  framework: string | null;
  /** Domain/URL of the most recent deployment, if any. */
  latestUrl: string | null;
}

export interface VercelDeployment {
  id: string;
  url: string;
  state: string;
  target: string | null;
  createdAt: number;
}

export interface VercelProjectDetail {
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
  latestDeployment: VercelDeployment | null;
}

export interface VercelEnvVar {
  id: string;
  key: string;
  /** Vercel never returns the plaintext value for "encrypted"/"sensitive" vars — masked client-side regardless, see manage/[projectId]/page.tsx. */
  value: string | null;
  target: Array<"production" | "preview" | "development">;
}

export interface VercelDomain {
  name: string;
  verified: boolean;
}

function toProjectDetail(data: any): VercelProjectDetail {
  const latest = data.latestDeployments?.[0];
  return {
    id: data.id,
    name: data.name,
    framework: data.framework ?? null,
    rootDirectory: data.rootDirectory ?? null,
    buildCommand: data.buildCommand ?? null,
    installCommand: data.installCommand ?? null,
    devCommand: data.devCommand ?? null,
    outputDirectory: data.outputDirectory ?? null,
    gitRepo: data.link?.repo ? `${data.link.org}/${data.link.repo}` : null,
    productionBranch: data.link?.productionBranch ?? null,
    liveUrl: data.targets?.production?.alias?.[0]
      ? `https://${data.targets.production.alias[0]}`
      : latest?.url
        ? `https://${latest.url}`
        : null,
    latestDeployment: latest
      ? { id: latest.uid, url: `https://${latest.url}`, state: latest.readyState || latest.state, target: latest.target ?? null, createdAt: latest.createdAt }
      : null,
  };
}

/** Lists every project in the connected account/team. */
export async function listProjects(token: string, teamId?: string | null): Promise<VercelProjectSummary[]> {
  const data = await vc(token, withTeam("/v9/projects?limit=100", teamId));
  return (data.projects || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    framework: p.framework ?? null,
    latestUrl: p.latestDeployments?.[0]?.url ? `https://${p.latestDeployments[0].url}` : p.targets?.production?.alias?.[0] ? `https://${p.targets.production.alias[0]}` : null,
  }));
}

/** Full detail for one project — used by the Overview / Build / Git sections. */
export async function getProject(token: string, projectId: string, teamId?: string | null): Promise<VercelProjectDetail> {
  const data = await vc(token, withTeam(`/v9/projects/${projectId}`, teamId));
  return toProjectDetail(data);
}

export interface UpdateProjectInput {
  framework?: string | null;
  rootDirectory?: string | null;
  buildCommand?: string | null;
  installCommand?: string | null;
  devCommand?: string | null;
  outputDirectory?: string | null;
  /** Git production branch — a separate field from the build/dev settings above, but same PATCH endpoint. */
  productionBranch?: string;
}

/** Patches build/dev settings and/or the production branch. Used by both the "Build & Dev Settings" and "Git" sections. */
export async function updateProject(token: string, projectId: string, patch: UpdateProjectInput, teamId?: string | null): Promise<VercelProjectDetail> {
  const body: Record<string, any> = {};
  if (patch.framework !== undefined) body.framework = patch.framework;
  if (patch.rootDirectory !== undefined) body.rootDirectory = patch.rootDirectory || null;
  if (patch.buildCommand !== undefined) body.buildCommand = patch.buildCommand || null;
  if (patch.installCommand !== undefined) body.installCommand = patch.installCommand || null;
  if (patch.devCommand !== undefined) body.devCommand = patch.devCommand || null;
  if (patch.outputDirectory !== undefined) body.outputDirectory = patch.outputDirectory || null;
  if (patch.productionBranch !== undefined) body.link = { productionBranch: patch.productionBranch };

  const data = await vc(token, withTeam(`/v9/projects/${projectId}`, teamId), {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return toProjectDetail(data);
}

/** Permanently deletes a project — the caller is responsible for confirming with the user first (see the Danger Zone's type-to-confirm modal). */
export async function deleteProject(token: string, projectId: string, teamId?: string | null): Promise<void> {
  await vc(token, withTeam(`/v9/projects/${projectId}`, teamId), { method: "DELETE" });
}

/** Lists environment variables. Values come back masked/decrypted only when Vercel allows it — treat as display-only either way (see EnvVar type). */
export async function listEnvVars(token: string, projectId: string, teamId?: string | null): Promise<VercelEnvVar[]> {
  const data = await vc(token, withTeam(`/v9/projects/${projectId}/env`, teamId));
  return (data.envs || []).map((e: any) => ({ id: e.id, key: e.key, value: typeof e.value === "string" ? e.value : null, target: e.target || [] }));
}

export async function createEnvVar(token: string, projectId: string, envVar: EnvVarInput, teamId?: string | null): Promise<void> {
  await vc(token, withTeam(`/v10/projects/${projectId}/env`, teamId), {
    method: "POST",
    body: JSON.stringify({ key: envVar.key, value: envVar.value, type: "encrypted", target: envVar.targets }),
  });
}

export async function updateEnvVar(
  token: string,
  projectId: string,
  envId: string,
  patch: { value?: string; targets?: EnvVarInput["targets"] },
  teamId?: string | null
): Promise<void> {
  const body: Record<string, any> = {};
  if (patch.value !== undefined) body.value = patch.value;
  if (patch.targets !== undefined) body.target = patch.targets;
  await vc(token, withTeam(`/v9/projects/${projectId}/env/${envId}`, teamId), {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteEnvVar(token: string, projectId: string, envId: string, teamId?: string | null): Promise<void> {
  await vc(token, withTeam(`/v9/projects/${projectId}/env/${envId}`, teamId), { method: "DELETE" });
}

export async function listDomains(token: string, projectId: string, teamId?: string | null): Promise<VercelDomain[]> {
  const data = await vc(token, withTeam(`/v9/projects/${projectId}/domains`, teamId));
  return (data.domains || []).map((d: any) => ({ name: d.name, verified: Boolean(d.verified) }));
}

export async function removeDomain(token: string, projectId: string, domain: string, teamId?: string | null): Promise<void> {
  await vc(token, withTeam(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`, teamId), { method: "DELETE" });
}

/** Most recent deployments for a project, newest first. */
export async function listDeployments(token: string, projectId: string, teamId?: string | null): Promise<VercelDeployment[]> {
  const data = await vc(token, withTeam(`/v6/deployments?projectId=${projectId}&limit=15`, teamId));
  return (data.deployments || []).map((d: any) => ({
    id: d.uid,
    url: `https://${d.url}`,
    state: d.state || d.readyState,
    target: d.target ?? null,
    createdAt: d.createdAt ?? d.created,
  }));
}

/** Triggers a fresh deployment of the project's latest deployment (same source, rebuilt from scratch). */
export async function redeployLatest(token: string, projectId: string, teamId?: string | null): Promise<VercelDeployment> {
  const deployments = await listDeployments(token, projectId, teamId);
  const latest = deployments[0];
  if (!latest) throw new VercelApiError(404, "no_deployment", "This project has no deployments to redeploy yet.");

  const project = await getProject(token, projectId, teamId);
  const data = await vc(token, withTeam("/v13/deployments", teamId), {
    method: "POST",
    body: JSON.stringify({
      name: project.name,
      deploymentId: latest.id,
      target: latest.target || "production",
    }),
  });
  return { id: data.id, url: `https://${data.url}`, state: data.readyState || data.state, target: data.target ?? null, createdAt: data.createdAt };
}

/** Promotes an existing (already-built) deployment to production, without rebuilding. */
export async function promoteDeployment(token: string, projectId: string, deploymentId: string, teamId?: string | null): Promise<void> {
  await vc(token, withTeam(`/v10/projects/${projectId}/promote/${deploymentId}`, teamId), { method: "POST" });
}

/**
 * Forces a brand-new deployment sourced from the HEAD of the project's
 * linked GitHub branch — as opposed to redeployLatest(), which just
 * rebuilds whatever commit the latest deployment already used. This is
 * the fix for "I pushed new files but Vercel hasn't picked them up" —
 * doesn't wait for GitHub's webhook to trigger Vercel, just tells Vercel
 * to go get the latest commit right now.
 */
export async function deployLatestFromGit(token: string, projectId: string, teamId?: string | null): Promise<VercelDeployment> {
  const project = await vc(token, withTeam(`/v9/projects/${projectId}`, teamId));
  const link = project.link;
  if (!link?.type || !link?.repo) {
    throw new VercelApiError(400, "no_git_link", "This project isn't linked to a Git repository, so there's no branch to pull from.");
  }
  const ref = link.productionBranch || "main";

  const gitSource: Record<string, any> = { type: link.type, ref };
  if (link.repoId) gitSource.repoId = link.repoId;
  else {
    gitSource.repo = link.repo;
    if (link.org) gitSource.org = link.org;
  }

  const data = await vc(token, withTeam("/v13/deployments", teamId), {
    method: "POST",
    body: JSON.stringify({ name: project.name, project: projectId, target: "production", gitSource }),
  });
  return { id: data.id, url: `https://${data.url}`, state: data.readyState || data.state, target: data.target ?? null, createdAt: data.createdAt };
}

export interface VercelDeploymentError {
  deploymentId: string;
  message: string;
  code: string | null;
}

/**
 * Fetches the failure reason for a deployment, if it's in an ERROR/CANCELED
 * state — used to surface "why didn't my deploy go through" directly in
 * the app instead of the user having to dig through Vercel's own dashboard.
 * Returns null for a deployment that isn't currently failed.
 */
export async function getDeploymentError(token: string, deploymentId: string, teamId?: string | null): Promise<VercelDeploymentError | null> {
  const data = await vc(token, withTeam(`/v13/deployments/${deploymentId}`, teamId));
  const state = String(data.readyState || data.state || "").toUpperCase();
  if (state !== "ERROR" && state !== "CANCELED") return null;
  const message =
    data.errorMessage ||
    data.error?.message ||
    (state === "CANCELED"
      ? "The deployment was canceled before it finished."
      : "The deployment failed, but Vercel didn't return a specific error message.");
  return { deploymentId, message, code: data.errorCode || data.error?.code || null };
}

export interface VercelDeploymentStatus {
  id: string;
  state: string;
  url: string | null;
}

/**
 * Lightweight status check for a single deployment (state only, no error
 * detail — see getDeploymentError above for that) — used to poll a
 * just-triggered deploy until it leaves BUILDING/QUEUED/INITIALIZING, so
 * the app can report the real outcome instead of just "request accepted".
 */
export async function getDeploymentStatus(token: string, deploymentId: string, teamId?: string | null): Promise<VercelDeploymentStatus> {
  const data = await vc(token, withTeam(`/v13/deployments/${deploymentId}`, teamId));
  return {
    id: deploymentId,
    state: String(data.readyState || data.state || "").toUpperCase(),
    url: data.url ? `https://${data.url}` : null,
  };
}
