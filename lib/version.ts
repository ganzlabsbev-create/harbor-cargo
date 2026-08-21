/**
 * Single source of truth for the version shown in Settings → Version.
 * Bump this by hand whenever you ship a noticeable change, and add a line
 * to CHANGELOG below. This is independent from NEXT_PUBLIC_BUILD_ID (which
 * is just a per-deploy fingerprint used to detect stale client bundles).
 */
export const APP_VERSION = "0.20.0";

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM
  notes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.20.0",
    date: "2026-08",
    notes: [
      "Harbor PWA: fixed generated manifest.ts landing at a hardcoded app/manifest.ts even for src/app projects, which created a second, unserved app/ root — it now always follows the same App Router root as layout.tsx.",
      "Harbor PWA: framework detection no longer misclassifies SvelteKit/Nuxt/Astro/Remix projects as plain Vite just because they also ship a vite.config.* file — a project's own framework-specific dependency/config evidence now always outranks generic Vite evidence.",
      "Harbor PWA: the generated service worker no longer cache-first's everything — /api/* requests, non-GET requests, and any response marked Cache-Control: private or no-store are now never cached; only static assets stay cache-first, everything else is network-first.",
      "Harbor PWA: patching an existing Nuxt project's nuxt.config no longer risks a duplicate/overwritten app key — it now merges into an existing app.head (preserving unrelated app/head properties) instead of always inserting a fresh block, and refuses to touch shapes it can't safely parse.",
    ],
  },
  {
    version: "0.19.1",
    date: "2026-08",
    notes: [
      "Harbor PWA (internal): all generated manifest/service-worker/icon URLs now go through one shared path resolver instead of being hardcoded per framework strategy — no visible behavior change yet, but it's the groundwork for upcoming base-path-aware framework support (Vite subpath deploys, Next basePath, etc).",
    ],
  },
  {
    version: "0.19.0",
    date: "2026-08",
    notes: [
      "Harbor PWA now supports build-step projects, not just static HTML/CSS/JS — Vite, Create React App, Angular, SvelteKit, Astro, Gatsby, and Remix get their manifest/icons/service worker wired into the project's real entry file automatically.",
      "Harbor PWA now supports Next.js fully: App Router projects use Next's own icon/manifest file conventions plus a small service-worker component, and Pages Router projects get a pages/_document.tsx created automatically if one doesn't exist yet.",
      "Harbor PWA now supports Nuxt 3 — patches nuxt.config's app.head for the manifest/theme-color/icon tags and adds a client plugin to register the service worker.",
      "Harbor PWA: fixed generated icons/manifest landing outside Vite's public/ folder, where the build would never have picked them up.",
      "Harbor PWA: when a project can't be wired up fully automatically, the result screen now lists exactly what's left to finish by hand instead of failing silently.",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-08",
    notes: [
      "Harbor Preview: added a Network tab that shows every image/script/stylesheet, fetch(), and XHR request a static preview makes, with pass/fail status — not available yet in Dev Server mode.",
      "Harbor Preview: tapping a 'file.js:12' location in a Console error now jumps straight to that line in the Files tab.",
      "Harbor Preview: the Files tab is now a real source viewer — tap any file to read it with line numbers, instead of just seeing names in a tree.",
      "Harbor Preview: added viewport presets (Phone, Large Phone, Tablet, Laptop, plus the original fill-the-frame view) with a rotate button, so you can check a static preview at different screen sizes without leaving the page.",
    ],
  },
  {
    version: "0.17.0",
    date: "2026-08",
    notes: [
      "Captain Harbor: the chat panel is now a proper dialog when full or half height (screen readers announce it correctly), Tab no longer escapes to the page behind it while full-screen, and the message box focuses itself automatically when you open the panel.",
      "Captain Harbor: you can now drag a ZIP file straight onto the chat while it's waiting for one, instead of only being able to attach it via the paperclip button.",
      "Captain Harbor: now reports where people drop off in the flow (provider picked, file uploaded, confirmed, push succeeded/failed) so we can see which step loses people.",
      "Captain Harbor: evened out the chat's tone — a few replies still used a rougher pronoun left over from an earlier draft of the copy; those now match the rest of the widget.",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-08",
    notes: [
      "Harbor Preview Phase 2: Node/framework projects (Next.js, Vite, Create React App, SvelteKit, Nuxt, Astro, Gatsby, Remix) now get a real dev-server preview, powered by an in-browser Node runtime (WebContainers) — npm install and the dev server both run client-side, nothing sent to Harbor's server. Falls back automatically to the existing static preview when a browser can't run one or a project isn't recognized.",
      "Preview page now switches between Preview / Files / Logs through a ☰ menu instead of a fixed tab row, to leave room for the new install/dev-server log output without crowding the screen.",
    ],
  },
  {
    version: "0.15.1",
    date: "2026-08",
    notes: ["Harbor Preview now shows its own logo mark on the home-screen tool card instead of a generic icon."],
  },
  {
    version: "0.15.0",
    date: "2026-08",
    notes: [
      "New tool: Harbor Preview. Upload a ZIP and preview static HTML/CSS/JavaScript projects right in the browser — file tree, live preview, console/error output, and reload — with nothing sent to Harbor's server to execute (Phase 1 of Harbor Preview; Node/framework projects aren't previewable yet).",
      "From Harbor Preview, 'Create a new repository' and 'Update an existing repository' now hand off straight to the GitHub tool using the same uploaded file — no second upload, and you land right on the final confirm step.",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-08",
    notes: [
      "Fixed stutter on the floating file chip while dragging — it now moves independently of React's render cycle instead of re-rendering the whole file tree on every pixel of movement.",
      "Pages that load data (Settings, Vercel new/manage, GitHub update) now show an instant skeleton the moment you navigate, instead of the previous screen sitting frozen until the data arrives.",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-08",
    notes: [
      "Dragging a file in the file tree (new repo upload and update-repo diff view) now shows a floating chip that follows your finger, and auto-scrolls the list when you drag near its top/bottom edge — no more getting stuck at the visible edge with a long file list.",
      "Dragging a file onto a folder that already has a same-named file no longer silently renames it with a -2 suffix. You're asked to either replace the existing file or rename the one you dragged.",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-08",
    notes: [
      "The GitHub and Vercel tool cards on the home screen, and the repo fallback icon, now show each platform's real monochrome logo mark instead of a generic icon — same card style and colors as before, just the glyph changed.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-08",
    notes: [
      "Update-existing-repo flow now supports the same drag-to-move-into-folder gesture the new-repo flow got in 0.9.0 — press and drag a file's handle onto any folder to relocate it before committing, and its add/replace/delete status follows it. Files marked for deletion are locked instead (can't be moved).",
      "New: manage an existing Vercel project directly — pick it from the Vercel tool's new 'Manage a project' option to view an overview, edit Environment Variables and Domains, change Build & Dev Settings or the Git production branch, redeploy or promote a deployment, and delete the project (type-to-confirm).",
      "The Vercel tool now opens on a chooser (Deploy a new project / Manage a project) instead of going straight into the create flow.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-08",
    notes: [
      "New tool: Deploy to Vercel. Pick a repo you've already pushed, connect your Vercel account (OAuth — no manual token), and Vercel deploys straight from that GitHub repo. No zip re-upload — future GitHub pushes auto-deploy.",
      "Project setup is split into clear sections: General (name, framework), Git (repo, branch), Domain, Build & Development Settings, and Environment Variables.",
      "Requires Vercel's own GitHub App to have access to the repo — a one-time GitHub authorization the app links you to when needed.",
    ],
  },
  {
    version: "0.9.2",
    date: "2026-08",
    notes: [
      "Reverted the auto-generated preview-image fallback for repo icons — it often showed a generic/unrelated banner instead of the project's actual logo. A repo without a dedicated logo file now shows the plain GitHub icon again.",
    ],
  },
  {
    version: "0.9.1",
    date: "2026-08",
    notes: [
      "Repo logos in the 'update repository' picker now fall back to GitHub's own auto-generated preview image when a repo has no dedicated logo file, so most repos show a real picture instead of the plain color dot",
      "Every repo's icon is now attempted (previously only the first 24), loaded in the background in small batches so the list still appears instantly",
      "Hitting the upload rate limit now shows a live countdown that unlocks automatically at zero, instead of a static one-time message",
      "Upload, push, and commit steps now show elapsed time next to their loading label so a slow step doesn't look frozen",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-08",
    notes: [
      "New repository flow: you can now drag a file's handle onto any folder in the preview tree to move it there before pushing — no need to re-zip",
      "(Update-existing-repo flow doesn't have this yet — planned separately)",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-08",
    notes: [
      "The 'update repository' picker now shows each repo's actual logo (if it has one) or a language color dot instead of just the name — easier to spot the right one at a glance",
      "Uploaded ZIPs are now checked for files too large for GitHub, unsafe/traversal paths, and case-only filename collisions before pushing, instead of failing partway through",
      "Added a small size-limit hint (0–200MB) under the upload button",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-08",
    notes: [
      "GitHub errors now show a plain-language message (expired session, name already taken, rate limited, etc.) instead of the raw API response",
      "An unreadable/corrupted ZIP file now shows a clear message instead of a generic failure",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-08",
    notes: [
      "Uploads now go straight to Vercel Blob storage from the browser instead of through the server, removing the ~4.5MB size ceiling on ZIP uploads",
      "Added a per-user cooldown before the next upload is allowed, to prevent abuse (60s for a .zip, 5s per file for a loose-files bundle)",
      "Uploaded files are now cleaned up automatically — deleted right after a push/commit completes, or if you leave the page without ever pushing",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-08",
    notes: [
      "Rewrote the License page — HARBOR CARGO is now a public app, not internal software, so the page states the real proprietary license, user-content ownership, and third-party dependency licenses",
      "Added a new Privacy page under Settings, explaining exactly what data is collected, how the GitHub access token is handled, and how uploaded files are (not) retained",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-08",
    notes: [
      "Added a back button on the Settings page",
      "Fixed the 'check for updates' button not reliably detecting new deploys",
      "You can now upload a single file or multiple loose files — no need to zip them yourself",
      "Split About / How to use / Version / License into their own pages under Settings",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-08",
    notes: [
      "Added a file-tree preview when creating a new repository",
      "Added a file tree with add / replace / delete checkboxes when updating an existing repository",
      "Fixed GitHub profile avatars not loading",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-08",
    notes: ["Fixed the orange wave graphic floating instead of sitting flush under the header"],
  },
  {
    version: "0.2.0",
    date: "2026-08",
    notes: ["Added the 'update an existing repository' tool"],
  },
  {
    version: "0.1.0",
    date: "2026-08",
    notes: [
      "Initial release: sign in with GitHub, upload a ZIP, auto-detect the framework, and push to a brand-new repository",
    ],
  },
];
