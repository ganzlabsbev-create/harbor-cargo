import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { updateEnvVar, deleteEnvVar, VercelApiError } from "@/lib/vercel";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; envId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || (body.value === undefined && body.targets === undefined)) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  try {
    await updateEnvVar(session.vercelToken, params.id, params.envId, body, session.vercelTeamId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "update_env_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; envId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  try {
    await deleteEnvVar(session.vercelToken, params.id, params.envId, session.vercelTeamId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "delete_env_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
