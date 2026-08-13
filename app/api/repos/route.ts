import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listRepos, findRepoLogo } from "@/lib/github";

// Looking up a logo costs 1-5 GitHub API calls per repo, so only do it for
// the first page of repos (already sorted by most recently updated) to
// keep this route fast and stay well clear of rate limits.
const LOGO_LOOKUP_LIMIT = 24;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  try {
    const repos = await listRepos(session.token);

    const logos = await Promise.allSettled(
      repos.slice(0, LOGO_LOOKUP_LIMIT).map((r) => {
        const [owner, name] = r.full_name.split("/");
        return findRepoLogo(session.token, owner, name);
      })
    );

    const reposWithLogos = repos.map((r, i) => ({
      ...r,
      logoUrl: i < LOGO_LOOKUP_LIMIT && logos[i].status === "fulfilled" ? (logos[i] as PromiseFulfilledResult<string | null>).value : null,
    }));

    return NextResponse.json({ ok: true, repos: reposWithLogos });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "list_repos_failed", detail: String(err?.message || err) }, { status: 500 });
  }
}
