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
  };
}

/** Adds a custom domain to an already-created project. */
export async function addProjectDomain(token: string, projectId: string, domain: string, teamId?: string | null): Promise<void> {
  await vc(token, withTeam(`/v10/projects/${projectId}/domains`, teamId), {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
}

/** Polls the project once for its latest deployment URL (used right after create, since the first deployment can take a few seconds to register). */
export async function getLatestDeploymentUrl(token: string, projectId: string, teamId?: string | null): Promise<string | null> {
  try {
    const data = await vc(token, withTeam(`/v9/projects/${projectId}`, teamId));
    const url = data?.latestDeployments?.[0]?.url;
    return url ? `https://${url}` : null;
  } catch {
    return null;
  }
}
