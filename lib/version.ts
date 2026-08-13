/**
 * Single source of truth for the version shown in Settings → Version.
 * Bump this by hand whenever you ship a noticeable change, and add a line
 * to CHANGELOG below. This is independent from NEXT_PUBLIC_BUILD_ID (which
 * is just a per-deploy fingerprint used to detect stale client bundles).
 */
export const APP_VERSION = "0.4.0";

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM
  notes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
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
