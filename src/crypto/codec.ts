// crypto/codec.ts
//
// Small base64url helpers that work both in the browser (client components,
// where identities/signing happen) and in the Node.js API route runtime
// (where we re-verify signatures server-side before trusting a submission).

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const base64 = padded + pad;

  const binary =
    typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts any Uint8Array view into a plain ArrayBuffer suitable for the
 * Web Crypto API's BufferSource parameters. Newer TypeScript DOM typings
 * require ArrayBuffer specifically (not the broader ArrayBufferLike that
 * Uint8Array's .buffer is typed as), so call this at every SubtleCrypto
 * call site that takes raw bytes.
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
