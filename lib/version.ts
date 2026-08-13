/**
 * Single source of truth for the version shown in Settings → Version.
 * Bump this by hand whenever you ship a noticeable change, and add a line
 * to CHANGELOG below. This is independent from NEXT_PUBLIC_BUILD_ID (which
 * is just a per-deploy fingerprint used to detect stale client bundles).
 */
export const APP_VERSION = "0.8.0";

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM
  notes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
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
