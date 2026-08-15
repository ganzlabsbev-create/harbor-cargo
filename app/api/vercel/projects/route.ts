import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listProjects, VercelApiError } from "@/lib/vercel";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!session.vercelToken) return NextResponse.json({ ok: false, error: "vercel_not_connected" }, { status: 401 });

  try {
    const projects = await listProjects(session.vercelToken, session.vercelTeamId);
    return NextResponse.json({ ok: true, projects });
  } catch (err: any) {
    if (err instanceof VercelApiError) {
      return NextResponse.json({ ok: false, error: err.code, detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: "list_projects_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
