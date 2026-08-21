import type { MutationAction, MutationPlanEntry } from "../types";

export function planEntry(path: string, action: MutationAction, reason: string): MutationPlanEntry {
  return { path, action, reason };
}

/**
 * Standard yes/no decision for "should Harbor PWA manage (create-or-replace)
 * this artifact, or leave the existing one alone" — used for both manifest
 * and service-worker planning so the two rules stay identical instead of
 * drifting apart.
 */
export function decideManage(userWantsReplace: boolean, existingPath: string | null): { manage: boolean; action: MutationAction; reason: string } {
  if (!existingPath) {
    return { manage: true, action: "CREATE", reason: "no existing file detected" };
  }
  if (userWantsReplace) {
    return { manage: true, action: "UPDATE", reason: "existing file found, user chose Replace" };
  }
  return { manage: false, action: "PRESERVE", reason: "existing file found, keeping by default" };
}
