import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listRepos } from "@/lib/github";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  try {
    const repos = await listRepos(session.token);
    return NextResponse.json({ ok: true, repos });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "list_repos_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
