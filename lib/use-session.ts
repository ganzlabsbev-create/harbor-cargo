"use client";

import { useEffect, useState } from "react";

export interface SessionUser {
  login: string;
  avatarUrl: string;
}

interface SessionResult {
  user: SessionUser | null;
}

// Module-scoped, shared by every component instance for the lifetime of
// the page (reset naturally on a real page load — login and logout both
// go through a hard navigation, see Header.tsx, so there's no stale-cache
// case to handle here).
//
// Without this, every client-side route change remounted <Header> (it's
// rendered per-page, not in a shared layout) which reset useSession()
// back to its initial { user: null, loading: true } and re-fetched
// /api/me from scratch — so the avatar blanked out and reloaded on every
// single navigation even though the session hadn't actually changed.
// Caching the result means only the very first mount on the page ever
// pays for the fetch; every navigation after that reads the cached value
// synchronously, so the header just carries the already-known session
// straight through.
let sessionCache: SessionResult | null = null;
let sessionPromise: Promise<SessionResult> | null = null;

function fetchSession(): Promise<SessionResult> {
  if (sessionCache) return Promise.resolve(sessionCache);
  if (!sessionPromise) {
    sessionPromise = fetch("/api/me")
      .then((res) => res.json())
      .then((data): SessionResult => ({ user: data.ok ? data.user : null }))
      .catch((): SessionResult => ({ user: null }))
      .then((result) => {
        sessionCache = result;
        return result;
      });
  }
  return sessionPromise;
}

/**
 * Single shared source of truth for "is there a GitHub session" on the
 * client, backed by the existing /api/me endpoint (no new auth endpoint).
 *
 * Used by Header (account icon), Settings (account section), and
 * AuthGate (protected tool pages) so they all agree on the same
 * loading/guest/logged-in state instead of each doing their own fetch.
 */
export function useSession() {
  // Lazy initializer: if a previous mount (an earlier page, before this
  // navigation) already resolved the session, start already-loaded —
  // this is what stops the post-navigation avatar flash.
  const [state, setState] = useState<{ user: SessionUser | null; loading: boolean }>(() =>
    sessionCache ? { user: sessionCache.user, loading: false } : { user: null, loading: true }
  );

  useEffect(() => {
    if (sessionCache) return; // already resolved by an earlier mount
    let cancelled = false;
    fetchSession().then((result) => {
      if (!cancelled) setState({ user: result.user, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
