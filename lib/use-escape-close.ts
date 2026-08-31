"use client";

import { useEffect } from "react";

/**
 * Closes a modal/bottom-sheet on Escape, mirroring the existing
 * click-outside-the-backdrop behavior those components already have.
 * Pass `disabled: true` while a submit/delete/etc. is in flight so Escape
 * doesn't let someone dismiss a sheet mid-action (same guard those sheets
 * already apply to the backdrop's onClick).
 */
export function useEscapeClose(onClose: () => void, disabled?: boolean) {
  useEffect(() => {
    if (disabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, disabled]);
}
