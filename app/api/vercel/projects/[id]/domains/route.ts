import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listDomains, addProjectDomain, VercelApiError } from "@/lib/vercel";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  try {
    const domains = await listDomains(session.vercelToken, params.id, session.vercelTeamId);
    return NextResponse.json({ ok: true, domains });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "list_domains_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.domain !== "string" || !body.domain) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  try {
    await addProjectDomain(session.vercelToken, params.id, body.domain, session.vercelTeamId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "add_domain_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
