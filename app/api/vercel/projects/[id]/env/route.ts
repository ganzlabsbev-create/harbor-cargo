import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listEnvVars, createEnvVar, VercelApiError } from "@/lib/vercel";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  try {
    const envs = await listEnvVars(session.vercelToken, params.id, session.vercelTeamId);
    return NextResponse.json({ ok: true, envs });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "list_env_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.key !== "string" ||
    !body.key ||
    typeof body.value !== "string" ||
    !Array.isArray(body.targets) ||
    body.targets.length === 0
  ) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  try {
    await createEnvVar(session.vercelToken, params.id, { key: body.key, value: body.value, targets: body.targets }, session.vercelTeamId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "create_env_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
