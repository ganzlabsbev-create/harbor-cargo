# HARBOR CARGO

A hub of deploy/publish tools. The first tool is **GitHub Uploader** — log in
with your own GitHub account and push a project (as a ZIP) to a new or
existing repository of yours. Built so more tools/destinations (Vercel,
Netlify, ...) can be added later under `app/tools/*` without touching this
one.

## Architecture highlights
 
- **GitHub OAuth, relay-only.** The server exchanges the OAuth `code` for an
  access token (required, since `github.com/login/oauth/access_token` has no
  browser CORS support) and immediately AES‑256‑GCM encrypts it into an
  `httpOnly` session cookie. The token is never logged, cached, or written to
  the database. See `lib/session.ts` and `app/api/auth/github/callback/route.ts`.
- **Uploads go straight to Vercel Blob.** The browser uploads the ZIP
  directly to Blob storage (bypassing the ~4.5MB serverless function body
  limit), then the analyze/diff/push/commit-diff routes fetch it from there.
  The blob is deleted again once it's been used — see `lib/blob-fetch.ts`,
  `lib/use-blob-cleanup.ts`, `app/api/upload/blob-token/route.ts`, and
  `app/api/upload/blob-cleanup/route.ts`.
- **Per-user upload cooldown.** Before every upload the client calls
  `/api/upload/rate-limit`, which enforces a cooldown before the next one is
  allowed (60s for a `.zip`, 5s per file for a loose-files bundle). See
  `lib/rate-limit.ts`.
- **Postgres stores no secrets.** `users` and `projects` tables are for
  display/history only.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

## Environment variables to set on Vercel

| Variable | Where to get it |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | Create a GitHub **OAuth App** at https://github.com/settings/developers |
| `GITHUB_OAUTH_CLIENT_SECRET` | Same OAuth App |
| `SESSION_ENCRYPTION_KEY` | Generate a fresh secret: `openssl rand -base64 32` |
| `POSTGRES_URL` | Added automatically once you attach **Vercel Postgres** under the project's Storage tab |
| `BLOB_READ_WRITE_TOKEN` | Added automatically once you attach **Vercel Blob** under the project's Storage tab |
| `NEXT_PUBLIC_BUILD_ID` | Set automatically by `npm run build` (via `scripts/set-build-id.js`) — don't set it yourself |

When creating the GitHub OAuth App:
- **Homepage URL**: your deployed domain
- **Authorization callback URL**: `https://<your-domain>/api/auth/github/callback`

No longer needed (removed from this project): `APP_ACCESS_CODE`, `VERCEL_TOKEN`,
a static `GITHUB_TOKEN`.

## What was carried over from the previous project (AoTo-ZIP-GanZ-Labs)

**Moved as-is**
- `lib/zip.ts` — ZIP extraction + file tree building
- `lib/framework-detect.ts` — framework detection from config/deps

**Moved, but adapted**
- `lib/github.ts` — Git Data API calls, rewritten so every function takes a
  `token` parameter instead of reading `process.env.GITHUB_TOKEN`; added
  `listRepos` / `getAuthenticatedUser`
- `lib/i18n.ts`, `lib/i18n-context.tsx` — same provider/hook shape, all copy
  rewritten for HARBOR CARGO
- `components/UploadZone.tsx` — same drag/drop + analyze logic, restyled;
  now uploads straight to Vercel Blob and hands the blob reference (not the
  raw `File`) back to the parent page alongside the analysis result

**Written from scratch**
- Everything else: pages, layout, theme, `lib/session.ts`, `lib/db.ts`
  (new schema), `middleware.ts`, all API routes, icon/build-id scripts

## Icon generation

`public/harbor-cargo.png` is the source. `scripts/generate-icons.js` (uses
`sharp`) generates favicons, apple-touch-icon, PWA icons, and an og-image
into `public/icons/` — it runs automatically on `npm install` (postinstall).
Those files are already included in this export so you don't have to run it
immediately, but re-run `node scripts/generate-icons.js` any time you swap
the source PNG.
