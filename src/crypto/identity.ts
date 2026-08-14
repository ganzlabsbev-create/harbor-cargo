// crypto/identity.ts
//
// Generates a per-user cryptographic identity in the browser using the
// Web Crypto API (ECDSA, curve P-256). The PRIVATE key never leaves the
// browser: it is generated here, optionally persisted to localStorage,
// and is never sent to any server.
//
// Public key is re-encoded into a short, copy-pasteable string:
//   "GNS-PUB-<base64url of the raw SPKI public key bytes>"

import type { Identity } from "@/types";
import { bytesToBase64Url } from "./codec";

const ALGORITHM: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };

function getSubtle(): SubtleCrypto {
  const c = (globalThis as any).crypto;
  if (!c || !c.subtle) {
    throw new Error(
      "Web Crypto API is not available in this environment. GanZ GNS needs a browser with SubtleCrypto support."
    );
  }
  return c.subtle as SubtleCrypto;
}

/** Generates a brand-new identity (key pair) entirely client-side. */
export async function createIdentity(): Promise<Identity> {
  const subtle = getSubtle();

  const keyPair = await subtle.generateKey(ALGORITHM, true, ["sign", "verify"]);

  const [privateKeyJwk, publicKeyJwk, publicKeyRaw] = await Promise.all([
    subtle.exportKey("jwk", keyPair.privateKey),
    subtle.exportKey("jwk", keyPair.publicKey),
    subtle.exportKey("raw", keyPair.publicKey),
  ]);

  const publicKey = encodePublicKey(new Uint8Array(publicKeyRaw as ArrayBuffer));

  return { publicKey, privateKeyJwk, publicKeyJwk };
}

/** Turns raw SPKI/raw EC point bytes into the "GNS-PUB-..." display string. */
export function encodePublicKey(rawBytes: Uint8Array): string {
  return `GNS-PUB-${bytesToBase64Url(rawBytes)}`;
}

/** Strips the "GNS-PUB-" prefix and returns the base64url payload. */
export function decodePublicKeyPrefix(publicKey: string): string {
  if (!publicKey.startsWith("GNS-PUB-")) {
    throw new Error("Not a valid GanZ public key: missing GNS-PUB- prefix.");
  }
  return publicKey.slice("GNS-PUB-".length);
}

/** Re-imports a CryptoKey (for signing/verifying) from a stored JWK. */
export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.importKey("jwk", jwk, ALGORITHM, false, ["sign"]);
}

/** Re-imports a public CryptoKey from raw bytes decoded out of a "GNS-PUB-..." string. */
export async function importPublicKeyFromString(publicKey: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const { base64UrlToBytes, toArrayBuffer } = await import("./codec");
  const raw = base64UrlToBytes(decodePublicKeyPrefix(publicKey));
  return subtle.importKey("raw", toArrayBuffer(raw), ALGORITHM, false, ["verify"]);
}
