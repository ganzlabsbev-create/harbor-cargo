// Pure, dependency-free path helpers. Used both by the client-side ZIP
// extractor (security gate) and by the detection layer (path classification),
// so the "what counts as a safe/normalized project path" rule lives in one
// place instead of being re-derived per caller.

/**
 * Normalizes a zip-entry name into a safe, project-relative POSIX path, or
 * returns null if the entry cannot be made safe (traversal, absolute path,
 * drive letter, null byte, etc). Never throws.
 */
export function normalizeEntryPath(rawName: string): string | null {
  if (!rawName) return null;
  if (rawName.includes("\0")) return null; // null-byte injection

  // Normalize both kinds of separators to "/" before inspecting segments —
  // a Windows-built zip can legally contain backslashes in entry names.
  let name = rawName.replace(/\\/g, "/");

  // Reject Windows drive letters (C:\..., C:/...) and any other scheme-like
  // prefix (e.g. "file:").
  if (/^[a-zA-Z]:/.test(name)) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(name) && !name.startsWith("/")) {
    // e.g. "c:foo" already caught above; this also catches "file:foo"
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(name) || /^[a-zA-Z][a-zA-Z0-9+.-]*:[^/]/.test(name)) {
      return null;
    }
  }

  const isAbsolute = name.startsWith("/");
  const segments = name.split("/").filter((s) => s.length > 0);

  const cleaned: string[] = [];
  for (const seg of segments) {
    if (seg === ".") continue;
    // Any segment made entirely of dots — "..", "...", "....", etc — is
    // rejected outright. Some parsers/filesystems collapse runs of dots
    // in ways that can still resolve to a parent directory, so ".." isn't
    // the only shape worth blocking; there's no legitimate reason a
    // project archive needs an all-dots path segment.
    if (seg.length >= 2 && /^\.+$/.test(seg)) {
      return null;
    }
    cleaned.push(seg);
  }

  if (isAbsolute) return null; // absolute paths escape the virtual root
  if (cleaned.length === 0) return null;

  return cleaned.join("/");
}

/** True if two normalized paths only differ by case (risky on case-insensitive filesystems). */
export function isCaseCollision(a: string, b: string): boolean {
  return a !== b && a.toLowerCase() === b.toLowerCase();
}

export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function dirName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Relative path (POSIX, no leading "./") from a directory to a file path. */
export function relativeFrom(fromDir: string, toPath: string): string {
  const fromParts = fromDir.split("/").filter(Boolean);
  const toParts = toPath.split("/").filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) i++;
  const ups = fromParts.length - i;
  const downs = toParts.slice(i);
  return "../".repeat(ups) + downs.join("/");
}
