import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDeploymentStatus, VercelApiError } from "@/lib/vercel";

/**
 * Companion to the .../error route: that one only returns something once a
 * deployment has already failed. This one is the "is it done yet" check —
 * used to poll a just-triggered deploy (from Captain Harbor's chat, or the
 * manage page) until it leaves BUILDING/QUEUED/INITIALIZING.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; deploymentId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  try {
    const status = await getDeploymentStatus(session.vercelToken, params.deploymentId, session.vercelTeamId);
    return NextResponse.json({ ok: true, status });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "get_deploy_status_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
