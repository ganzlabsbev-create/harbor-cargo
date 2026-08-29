/**
 * A pending, not-yet-committed edit in GitHub Code. One shape covers every
 * kind of change the editor supports — edited file, brand-new file,
 * delete, rename — so the workspace page can keep a single
 * Map<key, PendingChange> instead of parallel arrays per change type.
 */
export type PendingChange =
  | { kind: "edit"; path: string; content: string; originalContent: string; baseSha: string }
  | { kind: "add"; path: string; content: string }
  | { kind: "delete"; path: string; baseSha: string }
  | { kind: "rename"; fromPath: string; toPath: string; baseSha: string; content?: string };

export function pendingChangeKey(c: PendingChange): string {
  return c.kind === "rename" ? c.fromPath : c.path;
}

/** Shape the /code/commit API route expects on the wire. */
export function toCommitPayload(changes: PendingChange[]) {
  return changes.map((c) => {
    if (c.kind === "edit") return { kind: "edit" as const, path: c.path, content: c.content, baseSha: c.baseSha };
    if (c.kind === "add") return { kind: "add" as const, path: c.path, content: c.content };
    if (c.kind === "delete") return { kind: "delete" as const, path: c.path, baseSha: c.baseSha };
    return { kind: "rename" as const, fromPath: c.fromPath, toPath: c.toPath, baseSha: c.baseSha, content: c.content };
  });
}
