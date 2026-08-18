// lib/captain-harbor/types.ts
//
// Shared types for the Captain Harbor floating chat widget
// (components/CaptainHarbor.tsx). Kept separate from the widget component
// so the state machine (captain-harbor-machine.ts) and the drag hook
// (lib/use-drag-panel.ts) can both import without pulling in JSX.

/** The four resting positions of the draggable chat panel. See lib/use-drag-panel.ts. */
export type PanelState = "full" | "half" | "collapsed" | "closed";

/** Providers the command parser recognizes. See LIVE_PROVIDERS below for which have a working flow. */
export type Provider = "github" | "vercel" | "netlify" | "cloudflare";

export const KNOWN_PROVIDERS: Provider[] = ["github", "vercel", "netlify", "cloudflare"];

/** Providers with a real, implemented action flow (matches app/tools/*). Others show "coming soon". */
export const LIVE_PROVIDERS: Provider[] = ["github", "vercel"];

export type Action = "create" | "update";

export type ChatRole = "bot" | "user";

export interface QuickReply {
  /** Shown on the button. */
  label: string;
  /** Fed back into the machine as if the user typed it. */
  value: string;
  /** Visual weight — "primary" for the "go" action, "ghost" for cancel/back. */
  tone?: "primary" | "ghost" | "danger";
}

export interface DiffPreview {
  added: string[];
  modified: string[];
  removed: string[];
  branch: string;
  owner: string;
  repo: string;
}

export interface ExecStep {
  label: string;
  done: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text?: string;
  /** Quick-reply buttons attached to a bot message. Disappear once acted on. */
  quickReplies?: QuickReply[];
  /** Set once quickReplies have been resolved (either tapped or superseded), so old buttons grey out. */
  repliesResolved?: boolean;
  preview?: DiffPreview;
  steps?: ExecStep[];
  /** Small inline spinner row, e.g. "กำลังตรวจสอบไฟล์...". */
  pending?: boolean;
}

/**
 * Everything the state machine needs to decide what a free-text message
 * means. `step` drives which branch of the reducer runs; the rest is
 * accumulated context carried across steps (mirrors the plan doc's
 * `provider / action / file / repository / changes / confirmed`).
 */
export type Step =
  | "idle"
  | "await_provider"
  | "await_action"
  | "await_file"
  | "await_repo_pick"
  | "await_repo_name"
  | "comparing"
  | "await_confirm"
  | "executing"
  | "done"
  // -- vercel-only steps (see runAction()/handleActionInput() branches in
  // CaptainHarbor.tsx). Vercel deploys straight from the linked GitHub repo,
  // so its flow never touches blob upload — "await_repo_pick" above is
  // reused for picking the *source* repo on the create side.
  | "await_project_name"
  | "await_project_pick";

export interface ChatState {
  step: Step;
  provider: Provider | null;
  action: Action | null;
  blobUrl: string | null;
  blobPathname: string | null;
  fileName: string | null;
  fileCount: number | null;
  owner: string | null;
  repo: string | null;
  branch: string | null;
  preview: DiffPreview | null;
  /** Vercel-only: id of the existing project picked for an "update" (redeploy). */
  projectId: string | null;
  /** Vercel-only: the project name, either typed by the user (create) or read off the picked project (update). */
  vercelProjectName: string | null;
  /** True once a step has produced state the user would lose by walking away (post-upload, pre-confirm/pre-done). */
  hasUnfinishedWork: boolean;
}

export const initialChatState: ChatState = {
  step: "idle",
  provider: null,
  action: null,
  blobUrl: null,
  blobPathname: null,
  fileName: null,
  fileCount: null,
  owner: null,
  repo: null,
  branch: null,
  preview: null,
  projectId: null,
  vercelProjectName: null,
  hasUnfinishedWork: false,
};

/** Lightweight page-context snapshot the widget reads from usePathname(). */
export interface PageContext {
  path: string;
  /** Provider implied by the current route, if any (e.g. /tools/github -> "github"). */
  provider: Provider | null;
}
