import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findRepoLogo } from "@/lib/github";

// Keep each batch small — a logo lookup can cost up to 5 GitHub API calls,
// so this bounds how many calls one request can trigger. The client calls
// this repeatedly (see app/tools/github/update/page.tsx) to progressively
// fill in logos for the whole repo list, not just the first page.
const MAX_BATCH = 15;

interface RepoRef {
  owner: string;
  name: string;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  let repos: RepoRef[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.repos)) {
      repos = body.repos
        .filter((r: any) => typeof r?.owner === "string" && typeof r?.name === "string")
        .slice(0, MAX_BATCH);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (repos.length === 0) return NextResponse.json({ ok: true, logos: {} });

  const results = await Promise.allSettled(repos.map((r) => findRepoLogo(session.token, r.owner, r.name)));

  const logos: Record<string, string | null> = {};
  repos.forEach((r, i) => {
    const result = results[i];
    logos[`${r.owner}/${r.name}`] = result.status === "fulfilled" ? result.value : null;
  });

  return NextResponse.json({ ok: true, logos });
}
