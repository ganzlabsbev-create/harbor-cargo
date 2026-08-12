import { cookies } from "next/headers";

/**
 * Encrypts/decrypts the GitHub access token that lives in the httpOnly
 * session cookie. The token is NEVER written to disk, logs, or the database —
 * see section 2.1 of the build spec. AES-256-GCM via the Web Crypto API
 * (available in the Next.js Edge/Node runtimes without extra deps).
 */

const COOKIE_NAME = "harbor_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export interface SessionData {
  token: string;
  login: string;
  avatarUrl: string;
  userId: number;
}

function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "SESSION_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to your environment variables."
    );
  }
  const encoder = new TextEncoder();
  return crypto.subtle
    .digest("SHA-256", encoder.encode(secret))
    .then((hash) => crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function encryptSession(data: SessionData): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const cipherBytes = new Uint8Array(cipher);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return toBase64Url(combined);
}

async function decryptSession(value: string): Promise<SessionData | null> {
  try {
    const key = await getKey();
    const combined = fromBase64Url(value);
    const iv = combined.slice(0, 12);
    const cipherBytes = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
    return JSON.parse(new TextDecoder().decode(plaintext)) as SessionData;
  } catch {
    return null;
  }
}

/** Called only from the OAuth callback route, right after exchanging the code. */
export async function createSessionCookie(data: SessionData) {
  const encrypted = await encryptSession(data);
  cookies().set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/** Reads + decrypts the session for the current request. Used by API routes. */
export async function getSession(): Promise<SessionData | null> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return decryptSession(raw);
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
