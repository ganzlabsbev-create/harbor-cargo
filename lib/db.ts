import { sql } from "@vercel/postgres";

/**
 * Vercel Postgres — stores only non-sensitive data used to render the UI.
 * NO table here ever stores a GitHub token. See lib/session.ts for how the
 * token is handled instead (httpOnly encrypted cookie, never persisted).
 */

let initialized = false;

async function ensureSchema() {
  if (initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      github_id BIGINT PRIMARY KEY,
      username TEXT NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(github_id),
      project_name TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      framework TEXT,
      pushed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  initialized = true;
}

export interface UserRow {
  github_id: number;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  user_id: number;
  project_name: string;
  repo_url: string;
  framework: string | null;
  pushed_at: string;
}

export async function upsertUser(user: { githubId: number; username: string; avatarUrl: string }) {
  await ensureSchema();
  await sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (${user.githubId}, ${user.username}, ${user.avatarUrl})
    ON CONFLICT (github_id) DO UPDATE
    SET username = EXCLUDED.username, avatar_url = EXCLUDED.avatar_url
  `;
}

export async function recordProjectPush(row: Omit<ProjectRow, "pushed_at">) {
  await ensureSchema();
  await sql`
    INSERT INTO projects (id, user_id, project_name, repo_url, framework)
    VALUES (${row.id}, ${row.user_id}, ${row.project_name}, ${row.repo_url}, ${row.framework})
  `;
}

export async function listProjectsForUser(userId: number, limit = 20): Promise<ProjectRow[]> {
  await ensureSchema();
  const { rows } = await sql<ProjectRow>`
    SELECT * FROM projects WHERE user_id = ${userId} ORDER BY pushed_at DESC LIMIT ${limit}
  `;
  return rows;
}
