import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { removeDomain, VercelApiError } from "@/lib/vercel";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; domain: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  try {
    await removeDomain(session.vercelToken, params.id, decodeURIComponent(params.domain), session.vercelTeamId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "remove_domain_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
