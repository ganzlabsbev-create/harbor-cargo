"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ticks up once per second while `active` is true, resetting to 0 every
 * time it (re)starts. Used to show "still working... (Ns)" next to loading
 * labels so a long step doesn't look frozen.
 */
export function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}

/**
 * Counts down from an initial number of seconds to 0, ticking every
 * second, and reports 0 once it's done (fully "unlocked"). Pass a new
 * `initialSeconds` value to (re)start the countdown; pass null to clear it.
 */
export function useCountdown(initialSeconds: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(initialSeconds);
  const deadlineRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialSeconds === null) {
      deadlineRef.current = null;
      setRemaining(null);
      return;
    }
    deadlineRef.current = Date.now() + initialSeconds * 1000;
    setRemaining(initialSeconds);
    const id = setInterval(() => {
      if (deadlineRef.current === null) return;
      const left = Math.ceil((deadlineRef.current - Date.now()) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeconds]);

  return remaining;
}
