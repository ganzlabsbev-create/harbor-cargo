import type { PwaFormState } from "./types";

export interface ManifestIconSpec {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

/** Builds a standard Web App Manifest object from the form + the icon paths that got generated. */
export function buildManifest(form: PwaFormState, icons: ManifestIconSpec[]) {
  return {
    name: form.appName,
    short_name: form.shortName || form.appName,
    description: form.description || undefined,
    start_url: form.startUrl || "/",
    display: form.display,
    background_color: form.backgroundColor,
    theme_color: form.themeColor,
    icons,
  };
}

export function serializeManifest(manifest: Record<string, unknown>): string {
  // Drop undefined fields (e.g. an empty description) before printing.
  const clean = JSON.parse(JSON.stringify(manifest));
  return JSON.stringify(clean, null, 2) + "\n";
}
