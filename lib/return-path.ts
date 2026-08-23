/**
 * Validates a client-supplied "return to this page after login" path.
 * Only a same-origin, absolute path is ever accepted — this is what stops
 * `?next=` from being turned into an open redirect (e.g. `next=https://evil`
 * or `next=//evil.com`).
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  // A relative path only — no scheme/host can be smuggled in.
  try {
    const url = new URL(value, "https://harbor.invalid");
    if (url.origin !== "https://harbor.invalid") return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
