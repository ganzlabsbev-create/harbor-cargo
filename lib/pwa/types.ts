import type { ClientFile } from "@/lib/client-zip";

export type DisplayMode = "standalone" | "fullscreen" | "minimal-ui" | "browser";

export interface ProjectAnalysis {
  fileCount: number;
  totalBytes: number;
  framework: string | null;
  /** True if the project needs a build step (Next.js, Vite, CRA, ...) — Harbor PWA
   * still edits the source, but the person has to rebuild before deploying. */
  needsBuild: boolean;
  entryHtmlPath: string | null;
  hasPackageJson: boolean;
  existingManifestPath: string | null;
  existingServiceWorkerPath: string | null;
  hasIcons: boolean;
  /** Folder to place generated icons/manifest into, e.g. "public" if one exists, else "". */
  assetRoot: string;
  suggestedStartUrl: string;
  suggestedAppName: string;
  suggestedDescription: string;
}

export interface PwaFormState {
  appName: string;
  shortName: string;
  description: string;
  startUrl: string;
  themeColor: string;
  backgroundColor: string;
  display: DisplayMode;
  replaceManifest: boolean;
  replaceServiceWorker: boolean;
}

export interface PwaIconSource {
  fileName: string;
  mimeType: string;
  /** Object URL for the live preview. */
  previewUrl: string;
  bytes: Uint8Array;
  isSquare: boolean;
  width: number;
  height: number;
}

export type GenerateStep =
  | "analyzing"
  | "icons"
  | "manifest"
  | "html"
  | "sw"
  | "packaging";

export interface GenerateResult {
  zipBlob: Blob;
  added: string[];
  updated: string[];
  unchanged: string[];
}

export type { ClientFile };
