"use client";

import { useEffect, useState } from "react";

export interface SessionUser {
  login: string;
  avatarUrl: string;
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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setUser(data.ok ? data.user : null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}
