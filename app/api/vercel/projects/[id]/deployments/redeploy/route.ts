import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { redeployLatest, VercelApiError } from "@/lib/vercel";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  try {
    const deployment = await redeployLatest(session.vercelToken, params.id, session.vercelTeamId);
    return NextResponse.json({ ok: true, deployment });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "redeploy_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
