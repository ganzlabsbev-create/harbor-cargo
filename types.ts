// types.ts
//
// Shared types for the GanZ Name System (GNS) identity/naming feature
// under src/crypto/ (identity.ts, signing.ts, verification.ts). This file
// was missing, which is why the build failed with:
//   Cannot find module '@/types' or its corresponding type declarations.
// (tsconfig maps "@/*" -> "./*", so "@/types" resolves to this file.)
//
// Kept separate from lib/ since these aren't HARBOR CARGO's own domain
// types (repos, uploads, sessions, Vercel projects) — see lib/session.ts,
// lib/github.ts, and lib/vercel.ts for those instead. Nothing outside
// src/crypto/ currently imports these — the GNS feature isn't wired into
// any page yet.

/** A client-generated ECDSA key pair, plus its "GNS-PUB-..." display string. The private key (privateKeyJwk) never leaves the browser — see src/crypto/identity.ts. */
export interface Identity {
  publicKey: string;
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
}

/** A signed ".ganz" name -> website pointer record. */
export interface NameRecord {
  name: string;
  website: string;
  ownerPublicKey: string;
  /** ISO 8601 timestamp, set once at creation and carried forward on every update. */
  createdAt: string;
  /** ISO 8601 timestamp, refreshed on every update. */
  updatedAt: string;
  /** base64url ECDSA signature over canonicalPayload() (see src/crypto/signing.ts). */
  signature: string;
}

/** Result of src/crypto/verification.ts's verifyRecord(). */
export interface VerificationResult {
  valid: boolean;
  checks: {
    signatureValid: boolean;
    ownerMatchesSignature: boolean;
    nameWellFormed: boolean;
    websiteWellFormed: boolean;
  };
  reason?: string;
}
