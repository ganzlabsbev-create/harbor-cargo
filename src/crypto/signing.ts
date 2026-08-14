// crypto/signing.ts
//
// Builds the exact byte string that gets signed, and produces signatures.
// Both signing (here) and verification (verification.ts) MUST derive the
// canonical payload the same way, or valid records will fail to verify.

import { importPrivateKey } from "./identity";
import { bytesToBase64Url, utf8ToBytes, toArrayBuffer } from "./codec";
import type { NameRecord } from "@/types";

/**
 * Canonical, order-independent payload for a name record.
 * We deliberately sign only the fields that define ownership + pointer,
 * joined with a separator that cannot appear inside a valid field
 * (names are restricted to [a-z0-9-] and websites are URL-encoded).
 */
export function canonicalPayload(
  record: Pick<NameRecord, "name" | "website" | "ownerPublicKey" | "createdAt" | "updatedAt">
): string {
  return [record.name, record.website, record.ownerPublicKey, record.createdAt, record.updatedAt].join(
    "\n"
  );
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as any).crypto;
  if (!c || !c.subtle) throw new Error("Web Crypto API is not available in this environment.");
  return c.subtle as SubtleCrypto;
}

/** Signs a record's canonical payload with the owner's private key (browser only). */
export async function signRecord(
  privateKeyJwk: JsonWebKey,
  record: Pick<NameRecord, "name" | "website" | "ownerPublicKey" | "createdAt" | "updatedAt">
): Promise<string> {
  const subtle = getSubtle();
  const privateKey = await importPrivateKey(privateKeyJwk);
  const payload = utf8ToBytes(canonicalPayload(record));

  const signatureBytes = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    toArrayBuffer(payload)
  );

  return bytesToBase64Url(new Uint8Array(signatureBytes));
}

/** Convenience: builds a complete, signed NameRecord in one call. */
export async function buildSignedRecord(params: {
  name: string;
  website: string;
  ownerPublicKey: string;
  privateKeyJwk: JsonWebKey;
  createdAt?: string; // pass the ORIGINAL createdAt when updating a website
}): Promise<NameRecord> {
  const now = new Date().toISOString();
  const createdAt = params.createdAt ?? now;
  const updatedAt = now;

  const base = {
    name: params.name,
    website: params.website,
    ownerPublicKey: params.ownerPublicKey,
    createdAt,
    updatedAt,
  };

  const signature = await signRecord(params.privateKeyJwk, base);

  return { ...base, signature };
}
