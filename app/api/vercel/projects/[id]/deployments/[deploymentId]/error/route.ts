import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDeploymentError, VercelApiError } from "@/lib/vercel";

export async function GET(_req: NextRequest, { params }: { params: { id: string; deploymentId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  try {
    const deployError = await getDeploymentError(session.vercelToken, params.deploymentId, session.vercelTeamId);
    return NextResponse.json({ ok: true, deployError });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "get_deploy_error_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
