// crypto/verification.ts
//
// Independent verification of a NameRecord. This module only needs the
// PUBLIC key that is already embedded in the record, so it is safe to run
// anywhere: in the browser (Verify page, search results) AND on the server
// (API routes re-check every submission instead of trusting the client).

import { importPublicKeyFromString } from "./identity";
import { canonicalPayload } from "./signing";
import { base64UrlToBytes, utf8ToBytes, toArrayBuffer } from "./codec";
import type { NameRecord, VerificationResult } from "@/types";

const NAME_RE = /^[a-z0-9-]{1,32}\.ganz$/;
const RESERVED = new Set(["www", "api", "admin", "root", "system"]);

export function isNameWellFormed(name: string): boolean {
  if (!NAME_RE.test(name)) return false;
  const label = name.slice(0, -".ganz".length);
  if (label.startsWith("-") || label.endsWith("-")) return false;
  if (RESERVED.has(label)) return false;
  return true;
}

export function isWebsiteWellFormed(website: string): boolean {
  try {
    const url = new URL(website);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getSubtle(): SubtleCrypto {
  const c = (globalThis as any).crypto;
  if (!c || !c.subtle) throw new Error("Web Crypto API is not available in this environment.");
  return c.subtle as SubtleCrypto;
}

/**
 * Fully verifies a NameRecord:
 *  1. name / website are well-formed
 *  2. the signature is a valid ECDSA signature
 *  3. the signature was produced by the private key matching ownerPublicKey
 *     over EXACTLY these field values (so nothing was tampered with)
 */
export async function verifyRecord(record: NameRecord): Promise<VerificationResult> {
  const nameWellFormed = isNameWellFormed(record.name);
  const websiteWellFormed = isWebsiteWellFormed(record.website);

  let signatureValid = false;
  let ownerMatchesSignature = false;

  try {
    const publicKey = await importPublicKeyFromString(record.ownerPublicKey);
    const payload = utf8ToBytes(
      canonicalPayload({
        name: record.name,
        website: record.website,
        ownerPublicKey: record.ownerPublicKey,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
    const signatureBytes = base64UrlToBytes(record.signature);
    const subtle = getSubtle();

    signatureValid = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      toArrayBuffer(signatureBytes),
      toArrayBuffer(payload)
    );
    // If verify() succeeded against ownerPublicKey specifically, the owner match
    // and the signature validity are the same check by construction.
    ownerMatchesSignature = signatureValid;
  } catch {
    signatureValid = false;
    ownerMatchesSignature = false;
  }

  const valid = nameWellFormed && websiteWellFormed && signatureValid && ownerMatchesSignature;

  let reason: string | undefined;
  if (!nameWellFormed) reason = "Name is not a valid .ganz name.";
  else if (!websiteWellFormed) reason = "Website is not a valid http(s) URL.";
  else if (!signatureValid) reason = "Signature does not match the record contents or owner key.";

  return {
    valid,
    checks: { signatureValid, ownerMatchesSignature, nameWellFormed, websiteWellFormed },
    reason,
  };
}

/** Confirms that a new record is an authorized update of an existing one (same owner, same name, newer timestamp). */
export function isAuthorizedUpdate(existing: NameRecord, incoming: NameRecord): boolean {
  return (
    existing.name === incoming.name &&
    existing.ownerPublicKey === incoming.ownerPublicKey &&
    existing.createdAt === incoming.createdAt &&
    new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()
  );
}
