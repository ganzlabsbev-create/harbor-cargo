import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createProjectFromRepo, addProjectDomain, getLatestDeploymentUrl, VercelApiError, EnvVarInput } from "@/lib/vercel";

interface Body {
  owner: string;
  repo: string;
  branch?: string;
  name: string;
  framework?: string | null;
  rootDirectory?: string;
  buildCommand?: string;
  installCommand?: string;
  devCommand?: string;
  outputDirectory?: string;
  domain?: string;
  environmentVariables?: EnvVarInput[];
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (!body.owner || !body.repo || !body.name) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  try {
    const project = await createProjectFromRepo(
      session.vercelToken,
      {
        name: body.name,
        owner: body.owner,
        repo: body.repo,
        productionBranch: body.branch,
        framework: body.framework,
        rootDirectory: body.rootDirectory,
        buildCommand: body.buildCommand,
        installCommand: body.installCommand,
        devCommand: body.devCommand,
        outputDirectory: body.outputDirectory,
        environmentVariables: body.environmentVariables,
      },
      session.vercelTeamId
    );

    // A custom domain has to be added after the project exists — failing
    // to attach it shouldn't fail the whole request, since the project and
    // its *.vercel.app URL are already live at this point.
    let domainWarning: string | null = null;
    if (body.domain) {
      try {
        await addProjectDomain(session.vercelToken, project.id, body.domain, session.vercelTeamId);
      } catch (err: any) {
        domainWarning = String(err?.message || err);
      }
    }

    // The first deployment can take a moment to register after project
    // creation — give it one short retry so the UI usually gets a real
    // live URL back instead of null.
    let deploymentUrl = project.deploymentUrl;
    if (!deploymentUrl) {
      await new Promise((r) => setTimeout(r, 2500));
      deploymentUrl = await getLatestDeploymentUrl(session.vercelToken, project.id, session.vercelTeamId);
    }

    return NextResponse.json({
      ok: true,
      projectId: project.id,
      projectName: project.name,
      dashboardUrl: project.dashboardUrl,
      deploymentUrl,
      domainWarning,
    });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json(
        { ok: false, error: err.code, detail: err.message, installUrl: err.installUrl },
        { status: err.status }
      );
    }
    return NextResponse.json({ ok: false, error: "create_project_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
