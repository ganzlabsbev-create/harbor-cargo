"use client";

// components/CaptainHarbor.tsx
//
// The floating "Captain Harbor" chat assistant described in the product
// plan: a chat-first command interface for HARBOR CARGO's providers.
// Rendered once from app/layout.tsx so it persists across client-side
// route changes (the panel + conversation state survive navigating
// between pages, since this component never unmounts).
//
// Structure:
//   - Floating anchor button (visible only when the panel is "closed")
//   - Draggable panel with three open positions (full/half/collapsed) —
//     see lib/use-drag-panel.ts for the drag geometry. Only the grab
//     handle bar is a drag target; the message list scrolls normally.
//   - A small client-side state machine (below) that walks the GitHub
//     create/update flow against the *existing* HARBOR CARGO APIs
//     (/api/repos, /api/upload, /api/diff, /api/push) — the same ones
//     components/UploadZone.tsx and app/tools/github/page.tsx use, so
//     nothing about auth, blob storage, or the diff/push semantics is
//     reinvented here.
//
// "github" and "vercel" have working flows; netlify/cloudflare still show a
// "coming soon" message per the plan (new ones can be wired in later by
// extending LIVE_PROVIDERS in lib/captain-harbor/types.ts and adding a
// branch to handleActionInput()/handleRepoPick()/handleConfirm() below).
//
// Vercel's flow deliberately looks different from GitHub's under the hood:
// it deploys straight from the linked GitHub repo (git-based deploys), so
// there's no ZIP/blob step at all — "target" resolves to a repo (create) or
// an existing Vercel project (update) instead of a repo + diff.

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { nanoid } from "nanoid";
import { track } from "@vercel/analytics";
import { X, Paperclip, Send, Check, Loader2, ExternalLink } from "lucide-react";
import { useLang } from "@/lib/i18n-context";
import { useDragPanel } from "@/lib/use-drag-panel";
import { useCountdown } from "@/lib/use-elapsed";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  cap,
  describeError,
  PROVIDER_LABEL,
  parseProvider,
  isCancelWord,
  isHelpWord,
  isBackWord,
  isCapabilitiesWord,
  parseHelpTarget,
  matchNaturalCommand,
} from "@/lib/captain-harbor/strings";
import {
  LIVE_PROVIDERS,
  initialChatState,
  type Action,
  type ChatMessage,
  type ChatState,
  type Provider,
  type QuickReply,
  type Step,
} from "@/lib/captain-harbor/types";

const MAX_ZIP_BYTES = 200 * 1024 * 1024;

/** Custom drop-off funnel events (P2 #13) — provider_selected -> file_uploaded
 *  -> confirmed -> push_success/push_failed. Wrapped so a blocked analytics
 *  script (ad-blockers, etc.) can never break the actual flow. */
function trackStep(name: string, props?: Record<string, string | number | boolean>) {
  try {
    track(name, props);
  } catch {
    // analytics is best-effort — never let it interrupt the flow
  }
}

/** Vercel project names only allow lowercase letters, digits, and dashes. */
function sanitizeProjectName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/** Only `{ provider, action }` — never blobUrl/blobPathname, which may have
 *  expired or been deleted by the time the user comes back. */
const RESUME_KEY = "captain-harbor-resume";

type ResumeState = { provider: Provider; action: Action };

function readResumeState(): ResumeState | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESUME_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed?.provider || !parsed?.action) return null;
    return parsed as ResumeState;
  } catch {
    return null;
  }
}

function writeResumeState(state: ResumeState) {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (private mode, etc) — the OAuth redirect
    // still works, just without state resume on return.
  }
}

/** Full page reload / new tab persistence (P1 #7) — survives an actual F5,
 *  unlike the sessionStorage resume above which only covers the OAuth
 *  round trip. Deliberately narrow: never blobUrl/blobPathname (may be
 *  gone by the time the user comes back), and never `preview`/projectId
 *  (large / can go stale) — just enough to recognize "there was unfinished
 *  work" and re-enter the flow at a safe point. */
const PERSIST_KEY = "captain-harbor-state-v1";

interface PersistedState {
  step: Step;
  provider: Provider | null;
  action: Action | null;
  owner: string | null;
  repo: string | null;
  fileName: string | null;
  fileCount: number | null;
}

function readPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.step || parsed.step === "idle" || parsed.step === "done") return null;
    if (!parsed?.provider || !LIVE_PROVIDERS.includes(parsed.provider)) return null;
    return parsed as PersistedState;
  } catch {
    return null;
  }
}

function writePersistedState(chat: ChatState) {
  try {
    if (chat.step === "idle" || chat.step === "done") {
      localStorage.removeItem(PERSIST_KEY);
      return;
    }
    const persisted: PersistedState = {
      step: chat.step,
      provider: chat.provider,
      action: chat.action,
      owner: chat.owner,
      repo: chat.repo,
      fileName: chat.fileName,
      fileCount: chat.fileCount,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(persisted));
  } catch {
    // localStorage unavailable — resume-after-reload just won't be offered.
  }
}

function clearPersistedState() {
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    // ignore
  }
}

/** /tools/github -> "github", /tools/vercel -> "vercel", everything else -> null. */
function providerFromPath(path: string): Provider | null {
  const m = path.match(/^\/tools\/([a-z]+)/);
  if (!m) return null;
  const p = parseProvider(m[1]);
  return p;
}

export default function CaptainHarbor() {
  const { lang } = useLang();
  const s = cap[lang];
  const pathname = usePathname();
  const drag = useDragPanel("closed");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chat, setChat] = useState<ChatState>(initialChatState);
  const [input, setInput] = useState("");
  const [greeted, setGreeted] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [rateLimitMsgId, setRateLimitMsgId] = useState<string | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const rateLimitRemaining = useCountdown(rateLimitSeconds);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Accessibility (P2 #12): container for the Tab-cycling focus trap, the
  // composer input to auto-focus when the panel opens from closed, and a
  // flag so the auto-focus effect only fires on a real closed->full
  // transition (not on every "full" re-render, e.g. after a drag snap).
  const panelRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const wasClosedForFocusRef = useRef(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // Typewriter (section 8): bumped on any user interaction with the chat
  // (tap/click, composer typing, sending) so in-flight typewriter
  // animations can skip straight to the full text instead of blocking
  // the person from moving on.
  const [interactionTick, setInteractionTick] = useState(0);
  const bumpInteraction = useCallback(() => setInteractionTick((t) => t + 1), []);
  // Synchronous guard against double-fire (e.g. a fast double-tap on a
  // quick-reply button) that setIsBusy(true) can't catch in time, since
  // the state update isn't visible until the next render.
  const isBusyRef = useRef(false);
  const chatRef = useRef(chat);
  chatRef.current = chat;

  // Full repo/project lists fetched once per pick step, so typing a filter
  // (P1 #10) never needs another round-trip — see goToRepoPick()/
  // goToProjectPick() and the filter effect below.
  const reposCacheRef = useRef<any[]>([]);
  const projectsCacheRef = useRef<any[]>([]);
  // Which of the two project-pick callers is currently waiting on the pick
  // — the existing "Redeploy project" flow (goes on to await_confirm) or
  // the new, purely read-only "View deployments" flow (goes on to list
  // deployments and return to the Vercel menu instead). See
  // goToProjectPick()/handleProjectPick() below.
  const projectPickPurposeRef = useRef<"redeploy" | "view">("redeploy");
  const repoPickMsgIdRef = useRef<string | null>(null);
  const projectPickMsgIdRef = useRef<string | null>(null);
  // A page-reload resume snapshot (P1 #7), read once on mount and shown the
  // next time the panel opens rather than popping it open unprompted.
  const pendingReloadResumeRef = useRef<PersistedState | null>(null);

  const pageProvider = useMemo(() => providerFromPath(pathname || ""), [pathname]);

  const addMsg = useCallback((partial: Omit<ChatMessage, "id">) => {
    const msg: ChatMessage = { id: nanoid(8), ...partial };
    setMessages((prev) => [...prev, msg]);
    return msg.id;
  }, []);

  const updateMsg = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const resolveReplies = useCallback((id: string) => {
    updateMsg(id, { repliesResolved: true });
  }, [updateMsg]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Focus trap only while full-screen (P2 #12) — "half" still leaves page
  // content visibly reachable, so trapping focus there would be surprising
  // rather than helpful; see lib/use-focus-trap.ts.
  useFocusTrap(drag.panelState === "full", panelRef);

  // Auto-focus the composer the moment the panel opens from fully closed
  // (P2 #12) — but not on every re-render while it's already open (e.g.
  // dragging between full/half), which would rudely steal focus back from
  // whatever the user was doing (like typing).
  useEffect(() => {
    const wasClosed = wasClosedForFocusRef.current;
    wasClosedForFocusRef.current = drag.panelState === "closed";
    if (wasClosed && drag.panelState === "full") {
      // Wait a tick for the panel's open transition/render to land first.
      const id = window.setTimeout(() => composerInputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [drag.panelState]);

  function setBusy(value: boolean) {
    isBusyRef.current = value;
    setIsBusy(value);
  }

  // Live countdown for a rate-limited upload (see handleFile) — ticks the
  // pending message's text down to 0 instead of leaving a static error.
  useEffect(() => {
    if (!rateLimitMsgId || rateLimitRemaining === null) return;
    if (rateLimitRemaining > 0) {
      updateMsg(rateLimitMsgId, { text: s.rateLimited(rateLimitRemaining), pending: false });
    } else {
      updateMsg(rateLimitMsgId, { text: s.rateLimitedReady, pending: false });
      setRateLimitMsgId(null);
      setRateLimitSeconds(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateLimitRemaining, rateLimitMsgId]);

  // Live repo/project filter (P1 #10) — as the user types on the repo-pick
  // or project-pick step, narrow the quick-reply buttons to matches instead
  // of always showing just the first page. Filters the list already fetched
  // by goToRepoPick()/goToProjectPick() (reposCacheRef/projectsCacheRef), so
  // this never triggers another request — it's a pure client-side substring
  // match against a small in-memory list.
  useEffect(() => {
    const query = input.trim().toLowerCase();
    if (chat.step === "await_repo_pick" && repoPickMsgIdRef.current) {
      const all = reposCacheRef.current;
      const filtered = query
        ? all.filter((r: any) => r.full_name.toLowerCase().includes(query) || r.name.toLowerCase().includes(query))
        : all;
      updateMsg(repoPickMsgIdRef.current, { quickReplies: repoQuickReplies(filtered) });
    } else if (chat.step === "await_project_pick" && projectPickMsgIdRef.current) {
      const all = projectsCacheRef.current;
      const filtered = query ? all.filter((p: any) => p.name.toLowerCase().includes(query)) : all;
      updateMsg(projectPickMsgIdRef.current, { quickReplies: projectQuickReplies(filtered) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, chat.step]);

  // Resume state that survived a GitHub/Vercel OAuth redirect (see the
  // `__login__`/`__login_vercel__` handlers in dispatch(), which stash
  // { provider, action } into sessionStorage right before leaving the app).
  // Runs once on mount, before the "greet" effect below — skips
  // provider/action selection entirely and drops the user straight back
  // into the flow. Where that lands differs by provider: GitHub's flow
  // needs a freshly-uploaded ZIP (any blobUrl from before the redirect may
  // have expired, and was never persisted), so it always goes to
  // `await_file`. Vercel's flow never uploads a ZIP at all — it deploys
  // straight from the linked GitHub repo — so there's no file step to
  // resume into; it goes straight to picking the target (repo for create,
  // existing project for update) instead.
  useEffect(() => {
    const resume = readResumeState();
    if (!resume || !LIVE_PROVIDERS.includes(resume.provider)) return;
    setGreeted(true);
    drag.open("full");

    if (resume.provider === "github") {
      setChat((c) => ({
        ...c,
        provider: resume.provider,
        action: resume.action,
        step: "await_file",
        hasUnfinishedWork: true,
      }));
      addMsg({ role: "bot", text: s.resumedAfterLogin(resume.action) });
      return;
    }

    // vercel
    setChat((c) => ({ ...c, provider: resume.provider, action: resume.action, hasUnfinishedWork: true }));
    addMsg({ role: "bot", text: s.resumedContinueVercel(resume.action) });
    if (resume.action === "create") void goToRepoPick();
    else void goToProjectPick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a snapshot of `chat` on every change, so a real page reload
  // (F5, closed tab) doesn't lose track of unfinished work entirely (P1 #7)
  // — see readPersistedState()/writePersistedState() above.
  useEffect(() => {
    writePersistedState(chat);
  }, [chat]);

  // Read back a page-reload snapshot once on mount. Doesn't touch `chat` or
  // pop the panel open by itself — that would be a jarring surprise right
  // after a refresh — it just stashes the snapshot and the next "panel
  // opened" greet (below) offers it as a resume card instead of the normal
  // greeting. The sessionStorage OAuth-resume effect above takes priority
  // when both exist, since it's the more time-sensitive of the two.
  useEffect(() => {
    const persisted = readPersistedState();
    if (persisted) pendingReloadResumeRef.current = persisted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Greet once, the first time the panel is opened — and if the user
  // opened it from a page that implies a provider (e.g. /tools/github),
  // offer that as a shortcut instead of asking from scratch.
  useEffect(() => {
    if (drag.panelState === "closed" || greeted) return;
    setGreeted(true);

    const reloadResume = pendingReloadResumeRef.current;
    if (reloadResume) {
      // Don't consume it yet — __resume_continue__/__resume_restart__ in
      // dispatch() read it again. Just offer the choice (P1 #7).
      addMsg({
        role: "bot",
        text: s.resumePrompt,
        quickReplies: [
          { label: s.resumeContinue, value: "__resume_continue__", tone: "primary" },
          { label: s.resumeRestart, value: "__resume_restart__", tone: "ghost" },
        ],
      });
      setChat((c) => ({ ...c, hasUnfinishedWork: true }));
      return;
    }

    if (pageProvider && LIVE_PROVIDERS.includes(pageProvider)) {
      addMsg({
        role: "bot",
        text: s.greetingWithContext(PROVIDER_LABEL[pageProvider]),
        animate: true,
        quickReplies: [
          { label: PROVIDER_LABEL[pageProvider], value: pageProvider, tone: "primary" },
          { label: s.helpAndCommandsLabel, value: "__help_menu__", tone: "ghost" },
        ],
      });
      setChat((c) => ({ ...c, step: "await_provider" }));
    } else {
      addMsg({ role: "bot", text: s.greeting, animate: true });
      setChat((c) => ({ ...c, step: "await_provider" }));
      showHomeMenu();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.panelState]);

  // ---- P3: home / GitHub menu / Vercel menu / Help & Commands -----------
  // These only add conversational structure around the *existing* flows —
  // every button here ultimately calls the same handleActionInput /
  // goToRepoPick / goToProjectPick / etc. used by the original chat.
  // Netlify/Cloudflare are intentionally left out of the home screen (still
  // "coming soon" if reached via typed text — see handleProviderInput).

  function showHomeMenu() {
    addMsg({
      role: "bot",
      text: s.homePrompt,
      animate: true,
      quickReplies: [
        { label: PROVIDER_LABEL.github, value: "github", tone: "primary" },
        { label: PROVIDER_LABEL.vercel, value: "vercel", tone: "primary" },
        { label: s.helpAndCommandsLabel, value: "__help_menu__", tone: "ghost" },
      ],
    });
  }

  function showHelpMenu() {
    addMsg({
      role: "bot",
      text: s.helpIntro,
      animate: true,
      quickReplies: [
        { label: PROVIDER_LABEL.github, value: "github", tone: "primary" },
        { label: PROVIDER_LABEL.vercel, value: "vercel", tone: "primary" },
        { label: s.myCapabilitiesLabel, value: "__help_capabilities__", tone: "primary" },
        { label: s.commandsLabel, value: "__help_commands__", tone: "primary" },
        { label: s.backLabel, value: "__back_home__", tone: "ghost" },
      ],
    });
  }

  function showHelpFor(target: Provider) {
    addMsg({
      role: "bot",
      text: target === "github" ? s.helpGithubText : s.helpVercelText,
      animate: true,
      quickReplies: [
        { label: PROVIDER_LABEL[target], value: target, tone: "primary" },
        { label: s.backLabel, value: "__back_home__", tone: "ghost" },
      ],
    });
  }

  function showCapabilities() {
    addMsg({
      role: "bot",
      text: s.capabilitiesText,
      animate: true,
      quickReplies: [{ label: s.backLabel, value: "__back_home__", tone: "ghost" }],
    });
  }

  function showCommandsList() {
    addMsg({
      role: "bot",
      text: s.commandsListText,
      animate: true,
      quickReplies: [{ label: s.backLabel, value: "__back_home__", tone: "ghost" }],
    });
  }

  function resetToIdle(sayCancelled: boolean) {
    clearPersistedState();
    setChat(initialChatState);
    chatRef.current = initialChatState;
    if (sayCancelled) addMsg({ role: "bot", text: s.cancelled });
    showHomeMenu();
  }

  /** Handles "__resume_continue__" from the page-reload resume card (P1 #7).
   *  Never trusts persisted step data blindly — blobUrl/blobPathname (github)
   *  and projectId/vercelProjectName (vercel) were never persisted, since
   *  they can go stale between visits, so any step that depended on one of
   *  those re-runs the cheapest step that can rebuild it instead of resuming
   *  into a broken diff/push. */
  function resumeAfterReload() {
    const persisted = pendingReloadResumeRef.current;
    pendingReloadResumeRef.current = null;
    if (!persisted?.provider || !persisted.action) {
      resetToIdle(false);
      return;
    }
    const { provider, action } = persisted;

    if (provider === "github") {
      // Every github step past "await_file" needs the uploaded ZIP's blob,
      // which was never persisted — so there's really only one safe place
      // to resume: ask for the file again.
      setChat({ ...initialChatState, provider, action, step: "await_file", hasUnfinishedWork: true });
      addMsg({ role: "bot", text: s.resumedAfterLogin(action) });
      return;
    }

    // Vercel: no blob dependency, but the picked target (projectId /
    // vercelProjectName) wasn't persisted either — re-run target picking.
    setChat({ ...initialChatState, provider, action, owner: persisted.owner, repo: persisted.repo, hasUnfinishedWork: true });
    addMsg({ role: "bot", text: s.resumedContinueVercel(action) });
    if (action === "create") void goToRepoPick();
    else void goToProjectPick();
  }

  // ---- provider / action selection ------------------------------------

  /** Shows the expanded GitHub menu (section 3 of the brief) — every
   *  button is a real, already-implemented action (see the __gh_*
   *  handlers in dispatch()). */
  function showGithubMenu() {
    addMsg({
      role: "bot",
      text: s.githubMenuPrompt,
      animate: true,
      quickReplies: [
        { label: s.uploadProjectLabel, value: "__gh_upload__", tone: "primary" },
        { label: s.updateRepositoryLabel, value: "__gh_update__", tone: "primary" },
        { label: s.createRepositoryLabel, value: "__gh_create__", tone: "primary" },
        { label: s.viewRepositoriesLabel, value: "__gh_view_repos__", tone: "primary" },
        { label: s.backLabel, value: "__back_home__", tone: "ghost" },
      ],
    });
  }

  /** Shows the expanded Vercel menu (section 4) — same idea, only actions
   *  the Vercel API integration already supports (deploy/redeploy/list). */
  function showVercelMenu() {
    addMsg({
      role: "bot",
      text: s.vercelMenuPrompt,
      animate: true,
      quickReplies: [
        { label: s.deployProjectLabel, value: "__vc_deploy__", tone: "primary" },
        { label: s.redeployProjectLabel, value: "__vc_redeploy__", tone: "primary" },
        { label: s.viewProjectsLabel, value: "__vc_view_projects__", tone: "primary" },
        { label: s.viewDeploymentsLabel, value: "__vc_view_deployments__", tone: "primary" },
        { label: s.backLabel, value: "__back_home__", tone: "ghost" },
      ],
    });
  }

  function handleProviderInput(raw: string, sourceMsgId?: string) {
    if (sourceMsgId) resolveReplies(sourceMsgId);
    const provider = parseProvider(raw);
    if (!provider) {
      addMsg({ role: "bot", text: s.unknownProvider });
      showHomeMenu();
      return;
    }
    if (!LIVE_PROVIDERS.includes(provider)) {
      addMsg({ role: "bot", text: s.providerComingSoon(PROVIDER_LABEL[provider]) });
      showHomeMenu();
      return;
    }
    trackStep("provider_selected", { provider });
    setChat((c) => ({ ...c, provider, step: "await_action" }));
    chatRef.current = { ...chatRef.current, provider, step: "await_action" };
    if (provider === "github") showGithubMenu();
    else showVercelMenu();
  }

  /** Sets the provider (github/vercel) then hands off to the *existing*
   *  handleActionInput("create"|"update") — reused verbatim, so
   *  auth checks, blob upload, diff/push, and the Vercel create/redeploy
   *  API calls are exactly the same code path as before. */
  async function startProviderAction(provider: Provider, action: Action) {
    setChat((c) => ({ ...c, provider }));
    chatRef.current = { ...chatRef.current, provider };
    await handleActionInput(action);
  }

  async function handleActionInput(raw: string, sourceMsgId?: string) {
    if (sourceMsgId) resolveReplies(sourceMsgId);
    const value = raw.trim().toLowerCase();
    const action = value === "create" || value === s.actionCreate.toLowerCase() ? "create"
      : value === "update" || value === s.actionUpdate.toLowerCase() ? "update"
      : null;
    if (!action) {
      addMsg({ role: "bot", text: s.unknownProvider });
      return;
    }

    // GitHub login is the base session for every provider here (repo
    // listing, and even Vercel's create flow, both go through it).
    const authed = await checkAuth();
    if (!authed) {
      addMsg({
        role: "bot",
        text: s.needLogin,
        quickReplies: [{ label: s.loginButton, value: "__login__", tone: "primary" }],
      });
      return;
    }

    if (chatRef.current.provider === "vercel") {
      const vercelConnected = await checkVercelConnected();
      if (!vercelConnected) {
        setChat((c) => ({ ...c, action, hasUnfinishedWork: true }));
        addMsg({
          role: "bot",
          text: s.needVercelLogin,
          quickReplies: [{ label: s.connectVercelButton, value: "__login_vercel__", tone: "primary" }],
        });
        return;
      }
      setChat((c) => ({ ...c, action, hasUnfinishedWork: true }));
      if (action === "create") {
        await goToRepoPick();
      } else {
        await goToProjectPick();
      }
      return;
    }

    setChat((c) => ({ ...c, action, step: "await_file", hasUnfinishedWork: true }));
    addMsg({ role: "bot", text: action === "update" ? s.askZipForUpdate : s.askZipForCreate });
  }

  /** Read-only GitHub repo listing (section 3's "View repositories") —
   *  same /api/repos route the create/update pickers already use, just
   *  displayed instead of used for picking. */
  async function viewRepositories() {
    if (isBusyRef.current) return;
    const authed = await checkAuth();
    if (!authed) {
      addMsg({
        role: "bot",
        text: s.needLogin,
        quickReplies: [{ label: s.loginButton, value: "__login__", tone: "primary" }],
      });
      return;
    }
    setChat((c) => ({ ...c, provider: "github", step: "await_action" }));
    chatRef.current = { ...chatRef.current, provider: "github", step: "await_action" };
    setBusy(true);
    const pendingId = addMsg({ role: "bot", text: s.checkingRateLimit, pending: true });
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!data.ok) {
        if (isSessionExpired(res.status, data)) {
          showSessionExpired(pendingId);
          return;
        }
        updateMsg(pendingId, { text: describeError(s, data.error), pending: false });
        return;
      }
      const repos = Array.isArray(data.repos) ? data.repos : [];
      if (repos.length === 0) {
        updateMsg(pendingId, { text: s.noReposFound, pending: false });
      } else {
        const lines = repos.slice(0, 20).map((r: any) => `• ${r.full_name}`).join("\n");
        updateMsg(pendingId, { text: `${s.repositoriesListIntro(repos.length)}\n${lines}`, pending: false });
      }
      showGithubMenu();
    } catch {
      updateMsg(pendingId, { text: describeError(s, null, true), pending: false });
    } finally {
      setBusy(false);
    }
  }

  /** Read-only Vercel project listing (section 4's "View projects") —
   *  same /api/vercel/projects route the redeploy picker already uses. */
  async function viewProjects() {
    if (isBusyRef.current) return;
    const authed = await checkAuth();
    if (!authed) {
      addMsg({
        role: "bot",
        text: s.needLogin,
        quickReplies: [{ label: s.loginButton, value: "__login__", tone: "primary" }],
      });
      return;
    }
    const vercelConnected = await checkVercelConnected();
    if (!vercelConnected) {
      addMsg({
        role: "bot",
        text: s.needVercelLogin,
        quickReplies: [{ label: s.connectVercelButton, value: "__login_vercel__", tone: "primary" }],
      });
      return;
    }
    setChat((c) => ({ ...c, provider: "vercel", step: "await_action" }));
    chatRef.current = { ...chatRef.current, provider: "vercel", step: "await_action" };
    setBusy(true);
    const pendingId = addMsg({ role: "bot", text: s.checkingVercel, pending: true });
    try {
      const res = await fetch("/api/vercel/projects");
      const data = await res.json();
      if (!data.ok) {
        if (isSessionExpired(res.status, data)) {
          showSessionExpired(pendingId);
          return;
        }
        updateMsg(pendingId, { text: describeError(s, data.error), pending: false });
        return;
      }
      const projects = Array.isArray(data.projects) ? data.projects : [];
      if (projects.length === 0) {
        updateMsg(pendingId, { text: s.noProjectsFound, pending: false });
      } else {
        const lines = projects.slice(0, 20).map((p: any) => `• ${p.name}`).join("\n");
        updateMsg(pendingId, { text: `${s.projectsListIntro(projects.length)}\n${lines}`, pending: false });
      }
      showVercelMenu();
    } catch {
      updateMsg(pendingId, { text: describeError(s, null, true), pending: false });
    } finally {
      setBusy(false);
    }
  }

  /** Kicks off the "View deployments" picker — reuses goToProjectPick()
   *  with purpose="view" so the actual project fetch/pick code is 100%
   *  shared with the existing "Redeploy project" flow. */
  async function viewDeploymentsPick() {
    if (isBusyRef.current) return;
    const authed = await checkAuth();
    if (!authed) {
      addMsg({
        role: "bot",
        text: s.needLogin,
        quickReplies: [{ label: s.loginButton, value: "__login__", tone: "primary" }],
      });
      return;
    }
    const vercelConnected = await checkVercelConnected();
    if (!vercelConnected) {
      addMsg({
        role: "bot",
        text: s.needVercelLogin,
        quickReplies: [{ label: s.connectVercelButton, value: "__login_vercel__", tone: "primary" }],
      });
      return;
    }
    setChat((c) => ({ ...c, provider: "vercel", step: "await_action" }));
    chatRef.current = { ...chatRef.current, provider: "vercel", step: "await_action" };
    await goToProjectPick("view");
  }

  async function checkAuth(): Promise<boolean> {
    try {
      const res = await fetch("/api/me");
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Whether the current session already has a Vercel connection (separate
   *  from the base GitHub login above — see /api/vercel/status). */
  async function checkVercelConnected(): Promise<boolean> {
    try {
      const res = await fetch("/api/vercel/status");
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.ok && data.connected);
    } catch {
      return false;
    }
  }

  /** True if a fetch response is the "session expired mid-flow" case (401 /
   *  `not_authenticated`), as opposed to a generic failure. */
  function isSessionExpired(status: number, data: any): boolean {
    return status === 401 || data?.error === "not_authenticated";
  }

  /**
   * /api/push and /api/commit-diff stream NDJSON once their blob-upload
   * loop starts (see app/tools/github/new/page.tsx and
   * app/tools/github/update/page.tsx for the fill-bar UI that consumes the
   * same stream) — but any validation failure before that loop begins
   * still comes back as a single plain JSON response. This normalizes
   * both cases to the same shape the old single-JSON response had
   * ({ok, error, detail, repoUrl/commitUrl, ...}) by reading through to
   * the final "done" event, and drops "progress" events along the way —
   * Captain Harbor's step checklist is intentionally not wired to
   * per-file progress (see the NOTE above handleConfirm's stepLabels).
   */
  async function readPushOrCommitResponse(res: Response): Promise<any> {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/x-ndjson") || !res.body) {
      return res.json();
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let finalData: any = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "done") finalData = event;
        // "progress" events are intentionally ignored here.
      }
    }
    return finalData || { ok: false, error: "push_failed" };
  }

  /** Shows a specific "you were logged out" message + a login button,
   *  instead of the generic error copy. Reuses `pendingId` if given so it
   *  replaces an in-flight "checking..." bubble rather than adding a new one. */
  function showSessionExpired(pendingId?: string) {
    const patch = {
      text: s.sessionExpired,
      pending: false,
      steps: undefined,
      quickReplies: [{ label: s.loginButton, value: "__login__", tone: "primary" as const }],
    };
    if (pendingId) updateMsg(pendingId, patch);
    else addMsg({ role: "bot", ...patch });
  }

  // ---- file upload -------------------------------------------------------

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFile(file: File) {
    if (isBusyRef.current) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      addMsg({ role: "bot", text: s.errorNotZip });
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      addMsg({ role: "bot", text: s.errorTooLarge });
      return;
    }

    addMsg({ role: "user", text: `📎 ${file.name}` });
    const pendingId = addMsg({ role: "bot", text: s.receivedZip(file.name), pending: true });
    setBusy(true);

    try {
      // Mirrors components/UploadZone.tsx: rate-limit check -> direct-to-blob
      // upload -> server-side analyze. Keeping the same three steps means
      // this reuses the exact same limits and error shapes as the form flow.
      const rateLimitRes = await fetch("/api/upload/rate-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "zip", fileCount: 1 }),
      });
      const rateLimitData = await rateLimitRes.json();
      if (!rateLimitData.ok) {
        if (isSessionExpired(rateLimitRes.status, rateLimitData)) {
          showSessionExpired(pendingId);
          return;
        }
        if (rateLimitData.error === "rate_limited" && typeof rateLimitData.retryAfterSeconds === "number") {
          // Live countdown instead of a static error — see the effect above
          // watching `rateLimitRemaining`. Re-enables itself at 0.
          setRateLimitMsgId(pendingId);
          setRateLimitSeconds(rateLimitData.retryAfterSeconds);
          return;
        }
        updateMsg(pendingId, { text: describeError(s, rateLimitData.error), pending: false });
        return;
      }

      updateMsg(pendingId, { text: s.checkingRateLimit });
      const blobResult = await upload(`uploads/${crypto.randomUUID()}.zip`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/blob-token",
      });

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blobResult.url, blobPathname: blobResult.pathname }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (isSessionExpired(res.status, data)) {
          showSessionExpired(pendingId);
          return;
        }
        updateMsg(pendingId, { text: describeError(s, data.error), pending: false });
        return;
      }

      trackStep("file_uploaded", { provider: chatRef.current.provider || "unknown", fileCount: data.fileCount });
      updateMsg(pendingId, { text: s.foundFiles(data.fileCount), pending: false });
      setChat((c) => ({
        ...c,
        blobUrl: blobResult.url,
        blobPathname: blobResult.pathname,
        fileName: file.name,
        fileCount: data.fileCount,
      }));

      if (chatRef.current.action === "create") {
        setChat((c) => ({ ...c, step: "await_repo_name" }));
        addMsg({ role: "bot", text: s.askRepoName });
      } else {
        await goToRepoPick();
      }
    } catch {
      updateMsg(pendingId, { text: describeError(s, null, true), pending: false });
    } finally {
      setBusy(false);
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (isBusy) return;
    if (chat.step !== "await_file") {
      addMsg({ role: "bot", text: s.waitingForFileNudge });
      return;
    }
    void handleFile(file);
  }

  // ---- drag-and-drop straight into the chat (P2 #14) ---------------------
  // Desktop/web only in practice (touch devices don't fire these), and only
  // while a ZIP is actually expected — dragging a file over the chat during
  // any other step (e.g. while typing a repo name) shouldn't do anything.

  function onChatDragOver(e: DragEvent<HTMLDivElement>) {
    if (chat.step !== "await_file" || isBusy) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setIsDraggingFile(true);
  }

  function onChatDragLeave(e: DragEvent<HTMLDivElement>) {
    // Only clear when actually leaving the container, not when moving
    // between its children (which also fires dragleave on the child).
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDraggingFile(false);
  }

  function onChatDrop(e: DragEvent<HTMLDivElement>) {
    setIsDraggingFile(false);
    if (chat.step !== "await_file" || isBusy) return;
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void handleFile(file);
  }

  // ---- repo resolution (github update flow + vercel create flow) --------

  /** Builds the (up to 8) quick-reply buttons for the repo-pick message —
   *  shared by the initial fetch and the live filter effect below (P1 #10). */
  function repoQuickReplies(repos: any[]) {
    return [
      ...repos.slice(0, 8).map((r: any) => ({ label: r.full_name, value: r.full_name, tone: "primary" as const })),
      { label: s.cancel, value: "__cancel_flow__", tone: "ghost" as const },
    ];
  }

  async function goToRepoPick() {
    setChat((c) => ({ ...c, step: "await_repo_pick" }));
    const pendingId = addMsg({ role: "bot", text: s.checkingRateLimit, pending: true });
    setBusy(true);
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!data.ok) {
        if (isSessionExpired(res.status, data)) {
          showSessionExpired(pendingId);
          return;
        }
        updateMsg(pendingId, { text: describeError(s, data.error), pending: false });
        return;
      }
      if (!Array.isArray(data.repos) || data.repos.length === 0) {
        updateMsg(pendingId, { text: s.noReposFound, pending: false });
        return;
      }
      reposCacheRef.current = data.repos;
      repoPickMsgIdRef.current = pendingId;
      const isVercel = chatRef.current.provider === "vercel";
      updateMsg(pendingId, {
        text: isVercel ? s.askWhichRepoForVercel : s.askWhichRepo,
        pending: false,
        quickReplies: repoQuickReplies(data.repos),
      });
    } catch {
      updateMsg(pendingId, { text: describeError(s, null, true), pending: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleRepoPick(raw: string, sourceMsgId?: string) {
    if (isBusyRef.current) return;
    if (sourceMsgId) resolveReplies(sourceMsgId);
    const fullName = raw.trim();

    // Resolved from the cached list fetched by goToRepoPick() — no need to
    // hit /api/repos again, the data's already in hand (P1 #10).
    const match = reposCacheRef.current.find(
      (r: any) =>
        r.full_name.toLowerCase() === fullName.toLowerCase() ||
        r.name.toLowerCase() === fullName.toLowerCase()
    );
    if (!match) {
      addMsg({ role: "bot", text: s.repoNotFound(fullName) });
      return;
    }

    const [owner, repo] = match.full_name.split("/");
    const branch = match.default_branch || "main";
    repoPickMsgIdRef.current = null;

    if (chatRef.current.provider === "vercel") {
      addMsg({ role: "bot", text: s.foundRepo(match.full_name) });
      setChat((c) => ({ ...c, owner, repo, branch, step: "await_project_name" }));
      const suggested = sanitizeProjectName(repo);
      addMsg({
        role: "bot",
        text: s.askProjectName(suggested),
        quickReplies: [
          { label: s.useSuggestedName(suggested), value: suggested, tone: "primary" },
          { label: s.cancel, value: "__cancel_flow__", tone: "ghost" },
        ],
      });
      return;
    }

    setChat((c) => ({ ...c, owner, repo }));
    const pendingId = addMsg({ role: "bot", text: s.foundRepo(match.full_name), pending: true });
    setBusy(true);
    try {
      setChat((c) => ({ ...c, branch, step: "comparing" }));
      await runDiff(owner, repo, branch, pendingId);
    } finally {
      setBusy(false);
    }
  }

  async function runDiff(owner: string, repo: string, branch: string, pendingId?: string) {
    try {
      const res = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: chatRef.current.blobUrl, blobPathname: chatRef.current.blobPathname, owner, repo, branch }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (isSessionExpired(res.status, data)) {
          showSessionExpired(pendingId);
          return;
        }
        if (pendingId) updateMsg(pendingId, { text: describeError(s, data.error), pending: false });
        else addMsg({ role: "bot", text: describeError(s, data.error) });
        return;
      }
      const preview = {
        added: data.diff.zipOnly,
        modified: data.diff.modified,
        removed: data.diff.repoOnly.map((f: any) => f.path),
        branch,
        owner,
        repo,
      };
      if (pendingId) updateMsg(pendingId, { pending: false });
      setChat((c) => ({ ...c, preview, step: "await_confirm" }));
      addMsg({
        role: "bot",
        text: `${s.previewIntro}\n🟢 +${preview.added.length}  🟡 ~${preview.modified.length}  🔴 -${preview.removed.length}\n${s.previewBranch(branch)}\n${s.previewOutro}`,
        preview,
        quickReplies: [
          { label: s.confirmGo, value: "__confirm_push__", tone: "primary" },
          { label: s.cancel, value: "__cancel_flow__", tone: "ghost" },
        ],
      });
    } catch {
      const text = describeError(s, null, true);
      if (pendingId) updateMsg(pendingId, { text, pending: false });
      else addMsg({ role: "bot", text });
    }
  }

  // ---- vercel project resolution (update flow = redeploy) ----------------

  function projectQuickReplies(projects: any[]) {
    return [
      ...projects.slice(0, 8).map((p: any) => ({ label: p.name, value: p.name, tone: "primary" as const })),
      { label: s.cancel, value: "__cancel_flow__", tone: "ghost" as const },
    ];
  }

  async function goToProjectPick(purpose: "redeploy" | "view" = "redeploy") {
    projectPickPurposeRef.current = purpose;
    setChat((c) => ({ ...c, step: "await_project_pick" }));
    const pendingId = addMsg({ role: "bot", text: s.checkingVercel, pending: true });
    setBusy(true);
    try {
      const res = await fetch("/api/vercel/projects");
      const data = await res.json();
      if (!data.ok) {
        if (isSessionExpired(res.status, data)) {
          showSessionExpired(pendingId);
          return;
        }
        updateMsg(pendingId, { text: describeError(s, data.error), pending: false });
        return;
      }
      if (!Array.isArray(data.projects) || data.projects.length === 0) {
        updateMsg(pendingId, { text: s.noProjectsFound, pending: false });
        return;
      }
      projectsCacheRef.current = data.projects;
      projectPickMsgIdRef.current = pendingId;
      updateMsg(pendingId, {
        text: purpose === "view" ? s.askWhichProjectForDeployments : s.askWhichProject,
        pending: false,
        quickReplies: projectQuickReplies(data.projects),
      });
    } catch {
      updateMsg(pendingId, { text: describeError(s, null, true), pending: false });
    } finally {
      setBusy(false);
    }
  }

  function handleProjectPick(raw: string, sourceMsgId?: string) {
    if (isBusyRef.current) return;
    if (sourceMsgId) resolveReplies(sourceMsgId);
    const typed = raw.trim();
    const match = projectsCacheRef.current.find(
      (p: any) => p.name.toLowerCase() === typed.toLowerCase() || p.id === typed
    );
    if (!match) {
      addMsg({ role: "bot", text: s.projectNotFound(typed) });
      return;
    }
    projectPickMsgIdRef.current = null;

    // "View deployments" (new, read-only) branches off here instead of
    // continuing into the existing redeploy-confirm flow below.
    if (projectPickPurposeRef.current === "view") {
      projectPickPurposeRef.current = "redeploy";
      void showProjectDeployments(match.id, match.name);
      return;
    }

    addMsg({ role: "bot", text: s.foundRepo(match.name) });
    setChat((c) => ({ ...c, projectId: match.id, vercelProjectName: match.name, step: "await_confirm" }));
    addMsg({
      role: "bot",
      text: `${s.previewIntro}\n${s.previewOutroVercelUpdate(match.name)}`,
      quickReplies: [
        { label: s.confirmGo, value: "__confirm_push__", tone: "primary" },
        { label: s.cancel, value: "__cancel_flow__", tone: "ghost" },
      ],
    });
  }

  /** Read-only deployment listing for a chosen project (section 4's "View
   *  deployments") — calls the same GET .../deployments route the Vercel
   *  manage page uses, then returns to the Vercel menu instead of
   *  proceeding into redeploy/confirm. */
  /** Shared "here's why it failed" box — real error text pulled from
   *  Vercel (same getDeploymentError() the manage page's error card uses),
   *  plus a one-tap copy button. Used both after "View deployments" and
   *  right after triggering a deploy/redeploy from chat. */
  function showDeploymentErrorBox(name: string, message: string, extraQuickReplies: QuickReply[] = []) {
    addMsg({
      role: "bot",
      text: `${s.deploymentErrorIntro(name)}\n\n${message}`,
      quickReplies: [
        { label: s.copyErrorLabel, value: `__copy__${encodeURIComponent(message)}`, tone: "ghost" },
        ...extraQuickReplies,
      ],
    });
  }

  async function showProjectDeployments(projectId: string, name: string) {
    setBusy(true);
    const pendingId = addMsg({ role: "bot", text: s.checkingVercel, pending: true });
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/deployments`);
      const data = await res.json();
      if (!data.ok) {
        if (isSessionExpired(res.status, data)) {
          showSessionExpired(pendingId);
          return;
        }
        updateMsg(pendingId, { text: describeError(s, data.error), pending: false });
        return;
      }
      const deployments = Array.isArray(data.deployments) ? data.deployments : [];
      if (deployments.length === 0) {
        updateMsg(pendingId, { text: s.deploymentsEmpty(name), pending: false });
      } else {
        const lines = deployments
          .slice(0, 10)
          .map((d: any) => `• ${d.state || "?"} — ${d.url || d.id}`)
          .join("\n");
        updateMsg(pendingId, { text: `${s.deploymentsListIntro(name)}\n${lines}`, pending: false });

        // The latest deployment is deployments[0] (API returns newest
        // first) — if it's the failing/canceled one, pull the actual
        // reason instead of leaving it as just a status word above.
        const latest = deployments[0];
        const latestState = String(latest?.state || "").toUpperCase();
        if (latest && (latestState === "ERROR" || latestState === "CANCELED")) {
          try {
            const errRes = await fetch(`/api/vercel/projects/${projectId}/deployments/${latest.id}/error`);
            const errData = await errRes.json();
            if (errData.ok && errData.deployError?.message) {
              showDeploymentErrorBox(name, errData.deployError.message);
            }
          } catch {
            // Couldn't fetch the detailed reason — the status line above
            // still told them it errored, not worth blocking on this.
          }
        }
      }
      setChat((c) => ({ ...c, step: "await_action" }));
      showVercelMenu();
    } catch {
      updateMsg(pendingId, { text: describeError(s, null, true), pending: false });
    } finally {
      setBusy(false);
    }
  }

  // ---- vercel project naming (create flow) --------------------------------

  function handleProjectNameInput(raw: string) {
    const name = sanitizeProjectName(raw.trim());
    if (!name) return;
    setChat((c) => ({ ...c, vercelProjectName: name, step: "await_confirm" }));
    const owner = chatRef.current.owner;
    const repo = chatRef.current.repo;
    const branch = chatRef.current.branch || "main";
    addMsg({
      role: "bot",
      text: `${s.previewIntro}\n${s.previewOutroVercel(`${owner}/${repo}`, branch, name)}`,
      quickReplies: [
        { label: s.createGo, value: "__confirm_push__", tone: "primary" },
        { label: s.cancel, value: "__cancel_flow__", tone: "ghost" },
      ],
    });
  }

  // ---- create flow: repo name --------------------------------------------

  function handleRepoNameInput(raw: string) {
    const repoName = raw.trim();
    if (!repoName) return;
    setChat((c) => ({ ...c, repo: repoName, step: "await_confirm" }));
    addMsg({
      role: "bot",
      text: `${s.previewIntro}\n${s.createPreviewOutro(chat.fileCount || 0)}\n${repoName}`,
      quickReplies: [
        { label: s.createGo, value: "__confirm_push__", tone: "primary" },
        { label: s.cancel, value: "__cancel_flow__", tone: "ghost" },
      ],
    });
  }

  // ---- execute (vercel) ----------------------------------------------------

  async function handleConfirmVercel() {
    setChat((c) => ({ ...c, step: "executing" }));

    const isCreate = chatRef.current.action === "create";
    const stepLabels = isCreate ? [s.stepCreateVercelProject, s.stepDeployVercel] : [s.stepDeployVercel];
    const execId = addMsg({
      role: "bot",
      text: isCreate ? s.executingVercelCreate : s.executingVercelUpdate,
      steps: stepLabels.map((label) => ({ label, done: false })),
    });

    try {
      if (isCreate) {
        const res = await fetch("/api/vercel/create-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: chatRef.current.owner,
            repo: chatRef.current.repo,
            branch: chatRef.current.branch || undefined,
            name: chatRef.current.vercelProjectName,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          if (isSessionExpired(res.status, data)) {
            trackStep("push_failed", { provider: "vercel", action: "create", error: "session_expired" });
            showSessionExpired(execId);
            setChat((c) => ({ ...c, step: "await_confirm" }));
            return;
          }
          trackStep("push_failed", { provider: "vercel", action: "create", error: data.error || "unknown" });
          updateMsg(execId, { text: describeError(s, data.error), steps: undefined });
          setChat((c) => ({ ...c, step: "await_confirm" }));
          return;
        }
        trackStep("push_success", { provider: "vercel", action: "create" });
        updateMsg(execId, { steps: stepLabels.map((label) => ({ label, done: true })) });
        const url = data.deploymentUrl || data.dashboardUrl;
        addMsg({
          role: "bot",
          text: s.doneVercelCreate,
          quickReplies: [
            ...(url ? [{ label: s.openDeployment, value: `__open__${url}`, tone: "primary" as const }] : []),
            { label: s.doAnother, value: "__restart__", tone: "ghost" as const },
          ],
        });
        setChat({ ...initialChatState, step: "done" });
      } else {
        const res = await fetch(`/api/vercel/projects/${chatRef.current.projectId}/deployments/git-deploy`, {
          method: "POST",
        });
        const data = await res.json();
        if (!data.ok) {
          if (isSessionExpired(res.status, data)) {
            trackStep("push_failed", { provider: "vercel", action: "update", error: "session_expired" });
            showSessionExpired(execId);
            setChat((c) => ({ ...c, step: "await_confirm" }));
            return;
          }
          trackStep("push_failed", { provider: "vercel", action: "update", error: data.error || "unknown" });
          updateMsg(execId, { text: describeError(s, data.error), steps: undefined });
          setChat((c) => ({ ...c, step: "await_confirm" }));
          return;
        }
        trackStep("push_success", { provider: "vercel", action: "update" });
        updateMsg(execId, { steps: stepLabels.map((label) => ({ label, done: true })) });

        // The request above only means "Vercel accepted the deploy" — the
        // actual build can still fail afterward. Poll briefly so a failed
        // build is reported right here instead of the old false-positive
        // "Deployment complete!" (the exact gap the person asked to fix —
        // this now reuses the same getDeploymentError()/getDeploymentStatus()
        // the manage page's error card already relies on).
        const deploymentId = data.deployment?.id as string | undefined;
        const projectName = chatRef.current.vercelProjectName || "";
        const url = data.deployment?.url;

        if (!deploymentId) {
          // No id to poll (shouldn't normally happen) — fall back to the
          // original immediate "complete" message rather than block.
          addMsg({
            role: "bot",
            text: s.doneVercelUpdate,
            quickReplies: [
              ...(url ? [{ label: s.openDeployment, value: `__open__${url}`, tone: "primary" as const }] : []),
              { label: s.doAnother, value: "__restart__", tone: "ghost" as const },
            ],
          });
          setChat({ ...initialChatState, step: "done" });
          return;
        }

        const statusId = addMsg({ role: "bot", text: s.checkingDeployStatus, pending: true });
        let finalState = String(data.deployment?.state || "").toUpperCase();
        const maxAttempts = 8; // ~2s apart -> up to ~16s before giving up and calling it "still building"
        for (let attempt = 0; attempt < maxAttempts && !["READY", "ERROR", "CANCELED"].includes(finalState); attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const statusRes = await fetch(`/api/vercel/projects/${chatRef.current.projectId}/deployments/${deploymentId}/status`);
            const statusData = await statusRes.json();
            if (statusData.ok && statusData.status?.state) finalState = statusData.status.state;
          } catch {
            break; // network hiccup mid-poll — report with whatever we last had
          }
        }

        if (finalState === "ERROR" || finalState === "CANCELED") {
          trackStep("push_failed", { provider: "vercel", action: "update", error: "build_failed" });
          updateMsg(statusId, { text: s.deployFailedShort, pending: false });
          try {
            const errRes = await fetch(`/api/vercel/projects/${chatRef.current.projectId}/deployments/${deploymentId}/error`);
            const errData = await errRes.json();
            if (errData.ok && errData.deployError?.message) {
              showDeploymentErrorBox(projectName, errData.deployError.message, [
                { label: s.doAnother, value: "__restart__", tone: "ghost" },
              ]);
            }
          } catch {
            // Status already told them it failed above — the detailed
            // reason just isn't available, not worth blocking on it.
          }
          setChat((c) => ({ ...c, step: "await_confirm" }));
          return;
        }

        if (finalState === "READY") {
          updateMsg(statusId, {
            pending: false,
            text: s.doneVercelUpdate,
            quickReplies: [
              ...(url ? [{ label: s.openDeployment, value: `__open__${url}`, tone: "primary" as const }] : []),
              { label: s.doAnother, value: "__restart__", tone: "ghost" as const },
            ],
          });
          setChat({ ...initialChatState, step: "done" });
          return;
        }

        // Still building after the poll window — don't falsely claim
        // success, point at View deployments so they can check back.
        updateMsg(statusId, {
          pending: false,
          text: s.deployStillBuilding(projectName),
          quickReplies: [{ label: s.viewDeploymentsLabel, value: "__vc_view_deployments__", tone: "primary" }],
        });
        setChat((c) => ({ ...c, step: "await_action" }));
      }
    } catch {
      trackStep("push_failed", { provider: "vercel", action: chatRef.current.action || "unknown", error: "network" });
      updateMsg(execId, { text: describeError(s, null, true), steps: undefined });
      setChat((c) => ({ ...c, step: "await_confirm" }));
    }
  }

  // ---- execute (github) -----------------------------------------------------

  async function handleConfirm(sourceMsgId?: string) {
    if (isBusyRef.current) return;
    setBusy(true);
    if (sourceMsgId) resolveReplies(sourceMsgId);

    if (chatRef.current.provider === "vercel") {
      try {
        await handleConfirmVercel();
      } finally {
        setBusy(false);
      }
      return;
    }

    setChat((c) => ({ ...c, step: "executing" }));

    // NOTE on real-progress-UI pass: /api/push and /api/commit-diff now
    // stream per-blob NDJSON progress (see app/tools/github/new/page.tsx
    // and app/tools/github/update/page.tsx), but this chat's checklist
    // ("Uploading" -> "Creating repo" -> "Pushing files", each item just
    // done:false/true) doesn't have a slot for a mid-step fraction like
    // "42/120 files" without changing the ChatMessage.steps shape itself.
    // Left as-is deliberately: the discrete step checklist is already an
    // honest representation (each step only flips to done once the real
    // work behind it actually finishes), just coarser-grained than the
    // dedicated pages' fill bars. Wiring the same {current,total} stream in
    // here is a reasonable follow-up if per-file progress is wanted inside
    // the chat too.
    const isUpdate = chat.action === "update";
    // "Remove files" is deliberately not a step here: Captain Harbor has no
    // per-file review UI for repoOnly files (unlike the update page's
    // DiffTreeView checkboxes), so the automatic flow never deletes repo
    // files — see the commit-diff changes build below.
    const stepLabels = isUpdate
      ? [s.stepUpload, s.stepUpdateFiles, s.stepCommit]
      : [s.stepUpload, s.stepCreateRepo, s.stepPushFiles];

    const execId = addMsg({
      role: "bot",
      text: isUpdate ? s.executingUpdate : s.executingCreate,
      steps: stepLabels.map((label) => ({ label, done: false })),
    });

    // Step 1 (upload) is already done by the time we get here.
    updateMsg(execId, { steps: stepLabels.map((label, i) => ({ label, done: i === 0 })) });

    try {
      let res: Response;
      if (isUpdate) {
        // Scoped, base_tree-based commit — the same endpoint
        // app/tools/github/update/page.tsx uses, instead of /api/push's
        // full-tree replace (which has no base_tree and force-pushes,
        // silently deleting every repo file not in the uploaded ZIP).
        // Built straight from the diff preview already shown to the user:
        // modified -> replace, zipOnly ("added") -> add. repoOnly
        // ("removed") files are intentionally left out — Captain Harbor
        // has no per-file review UI for deletions, so nothing is ever
        // auto-deleted from this flow.
        const preview = chat.preview;
        const changes = [
          ...(preview?.modified || []).map((path) => ({ path, action: "replace" as const })),
          ...(preview?.added || []).map((path) => ({ path, action: "add" as const })),
        ];
        if (changes.length === 0) {
          // Only repoOnly ("removed") entries in the diff — since those are
          // never auto-deleted from this flow, there's nothing left to
          // commit. Surface that plainly instead of calling an endpoint
          // that will reject an empty change set.
          trackStep("push_failed", { provider: "github", action: "update", error: "no_changes" });
          updateMsg(execId, { text: describeError(s, "no_changes"), steps: undefined });
          setChat((c) => ({ ...c, step: "await_confirm" }));
          return;
        }
        res = await fetch("/api/commit-diff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: chat.blobUrl,
            blobPathname: chat.blobPathname,
            owner: chat.owner,
            repo: chat.repo,
            branch: chat.branch,
            commitMessage: "Update via Captain Harbor",
            changes,
          }),
        });
      } else {
        res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: chat.blobUrl,
            blobPathname: chat.blobPathname,
            mode: "new",
            repoName: chat.repo,
            private: true,
          }),
        });
      }
      const data = await readPushOrCommitResponse(res);

      if (!data.ok) {
        if (isSessionExpired(res.status, data)) {
          trackStep("push_failed", { provider: "github", action: chat.action || "unknown", error: "session_expired" });
          showSessionExpired(execId);
          setChat((c) => ({ ...c, step: "await_confirm" }));
          return;
        }
        trackStep("push_failed", { provider: "github", action: chat.action || "unknown", error: data.error || "unknown" });
        updateMsg(execId, { text: describeError(s, data.error), steps: undefined });
        setChat((c) => ({ ...c, step: "await_confirm" }));
        return;
      }

      trackStep("push_success", { provider: "github", action: chat.action || "unknown" });
      updateMsg(execId, { steps: stepLabels.map((label) => ({ label, done: true })) });
      const url = data.repoUrl || data.commitUrl;
      addMsg({
        role: "bot",
        text: isUpdate ? s.doneUpdate : s.doneCreate,
        quickReplies: [
          ...(url ? [{ label: s.openRepo, value: `__open__${url}`, tone: "primary" as const }] : []),
          { label: s.doAnother, value: "__restart__", tone: "ghost" as const },
        ],
      });
      setChat({ ...initialChatState, step: "done" });
    } catch {
      trackStep("push_failed", { provider: "github", action: chat.action || "unknown", error: "network" });
      updateMsg(execId, { text: describeError(s, null, true), steps: undefined });
      setChat((c) => ({ ...c, step: "await_confirm" }));
    } finally {
      setBusy(false);
    }
  }

  // ---- top-level dispatcher ------------------------------------------------

  async function dispatch(raw: string, sourceMsgId?: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (trimmed === "__login__") {
      // Save just enough to resume after the OAuth redirect (see the mount
      // effect that reads this back and jumps straight to await_file).
      const { provider, action } = chatRef.current;
      if (provider && action) writeResumeState({ provider, action });
      window.location.href = "/api/auth/github";
      return;
    }
    if (trimmed === "__login_vercel__") {
      // Same idea, but the base GitHub session is already there — this is
      // the *additional* Vercel connection, so it redirects to the Vercel
      // OAuth route instead.
      const { provider, action } = chatRef.current;
      if (provider && action) writeResumeState({ provider, action });
      window.location.href = "/api/auth/vercel";
      return;
    }
    if (trimmed === "__resume_continue__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      addMsg({ role: "user", text: s.resumeContinue });
      resumeAfterReload();
      return;
    }
    if (trimmed === "__resume_restart__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      addMsg({ role: "user", text: s.resumeRestart });
      pendingReloadResumeRef.current = null;
      resetToIdle(false);
      return;
    }
    if (trimmed.startsWith("__open__")) {
      window.open(trimmed.replace("__open__", ""), "_blank", "noopener,noreferrer");
      return;
    }
    if (trimmed === "__restart__") {
      resetToIdle(false);
      return;
    }
    if (trimmed === "__cancel_flow__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      addMsg({ role: "user", text: s.cancel });
      resetToIdle(true);
      return;
    }
    if (trimmed === "__confirm_push__") {
      if (isBusyRef.current) return;
      const label = chatRef.current.action === "create" ? s.createGo : s.confirmGo;
      addMsg({ role: "user", text: label });
      trackStep("confirmed", {
        provider: chatRef.current.provider || "unknown",
        action: chatRef.current.action || "unknown",
      });
      await handleConfirm(sourceMsgId);
      return;
    }

    // ---- P3: home / GitHub menu / Vercel menu / Help & Commands tokens.
    // Each of these is just navigation or a direct hand-off into an
    // *existing* handler (handleActionInput, goToProjectPick, checkAuth,
    // etc.) — no new business logic, no fake actions.
    if (trimmed === "__back_home__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      setChat((c) => ({ ...c, step: "await_provider", provider: null, action: null }));
      chatRef.current = { ...chatRef.current, step: "await_provider", provider: null, action: null };
      showHomeMenu();
      return;
    }
    if (trimmed === "__help_menu__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      showHelpMenu();
      return;
    }
    if (trimmed === "__help_capabilities__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      showCapabilities();
      return;
    }
    if (trimmed === "__help_commands__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      showCommandsList();
      return;
    }
    if (trimmed === "__gh_upload__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      handleProviderInput("github");
      return;
    }
    if (trimmed === "__gh_update__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      await startProviderAction("github", "update");
      return;
    }
    if (trimmed === "__gh_create__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      await startProviderAction("github", "create");
      return;
    }
    if (trimmed === "__gh_view_repos__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      await viewRepositories();
      return;
    }
    if (trimmed === "__vc_deploy__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      await startProviderAction("vercel", "create");
      return;
    }
    if (trimmed === "__vc_redeploy__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      await startProviderAction("vercel", "update");
      return;
    }
    if (trimmed === "__vc_view_projects__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      await viewProjects();
      return;
    }
    if (trimmed === "__vc_view_deployments__") {
      if (sourceMsgId) resolveReplies(sourceMsgId);
      await viewDeploymentsPick();
      return;
    }

    addMsg({ role: "user", text: trimmed === "cancel" ? s.cancel : trimmed });

    // Global commands work from any step.
    if (isCancelWord(trimmed) && chat.step !== "idle") {
      resetToIdle(true);
      return;
    }
    if (isHelpWord(trimmed)) {
      showHelpMenu();
      return;
    }
    // "help github" / "help vercel" and "what can you do"-style phrasing
    // also work everywhere — they're purely informational and never touch
    // chat.step, so they can't clobber an in-progress upload/deploy.
    const helpTarget = parseHelpTarget(trimmed);
    if (helpTarget) {
      showHelpFor(helpTarget);
      return;
    }
    if (isCapabilitiesWord(trimmed)) {
      showHelpMenu();
      return;
    }

    // Section 6's remaining natural-language commands (back, github,
    // vercel, and the upload/deploy/redeploy/repository(-ies)/
    // deployment(s) shortcuts) only apply at the top-level, non-active-
    // workflow steps — deep inside an actual upload/deploy (await_file,
    // await_repo_pick, await_repo_name, await_confirm, executing,
    // await_project_pick, await_project_name) input keeps being handled
    // exactly as before, unmodified, so free-text repo/project names or
    // in-flight state is never hijacked.
    const NAV_SAFE_STEPS: ChatState["step"][] = ["idle", "await_provider", "await_action", "done"];
    const FALLBACK_STEPS: ChatState["step"][] = ["idle", "await_provider", "done"];
    if (NAV_SAFE_STEPS.includes(chat.step)) {
      if (isBackWord(trimmed)) {
        await dispatch("__back_home__");
        return;
      }
      const nat = matchNaturalCommand(trimmed);
      if (nat) {
        await dispatch(nat);
        return;
      }
      const provider = parseProvider(trimmed);
      if (provider) {
        handleProviderInput(trimmed);
        return;
      }
      if (FALLBACK_STEPS.includes(chat.step)) {
        addMsg({
          role: "bot",
          text: s.fallbackUnrecognized,
          animate: true,
          quickReplies: [{ label: s.helpAndCommandsLabel, value: "__help_menu__", tone: "ghost" }],
        });
        return;
      }
    }

    switch (chat.step) {
      case "idle":
      case "await_provider":
        handleProviderInput(trimmed, sourceMsgId);
        return;
      case "await_action":
        await handleActionInput(trimmed, sourceMsgId);
        return;
      case "await_file":
        addMsg({ role: "bot", text: s.waitingForFileNudge });
        return;
      case "await_repo_pick":
        if (trimmed === "cancel") {
          resetToIdle(true);
          return;
        }
        await handleRepoPick(trimmed, sourceMsgId);
        return;
      case "await_repo_name":
        handleRepoNameInput(trimmed);
        return;
      case "await_project_pick":
        if (trimmed === "cancel") {
          resetToIdle(true);
          return;
        }
        handleProjectPick(trimmed, sourceMsgId);
        return;
      case "await_project_name":
        handleProjectNameInput(trimmed);
        return;
      case "await_confirm":
        if (trimmed === "confirm") {
          await handleConfirm(sourceMsgId);
        } else if (trimmed === "cancel") {
          resetToIdle(true);
        }
        return;
      case "done":
        handleProviderInput(trimmed, sourceMsgId);
        return;
      default:
        return;
    }
  }

  function onQuickReply(msgId: string, qr: QuickReply) {
    if (isBusyRef.current) return;
    bumpInteraction();
    // Copy-to-clipboard buttons (deployment error boxes) never go through
    // dispatch() — they're a pure client-side action, not a conversation
    // turn, so nothing gets echoed and the chat step/workflow is untouched.
    if (qr.value.startsWith("__copy__")) {
      const text = decodeURIComponent(qr.value.slice("__copy__".length));
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId && m.quickReplies
                ? { ...m, quickReplies: m.quickReplies.map((r) => (r.value === qr.value ? { ...r, label: s.copiedLabel } : r)) }
                : m
            )
          );
          window.setTimeout(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId && m.quickReplies
                  ? { ...m, quickReplies: m.quickReplies.map((r) => (r.value === qr.value ? { ...r, label: s.copyErrorLabel } : r)) }
                  : m
              )
            );
          }, 1500);
        })
        .catch(() => {
          // clipboard access denied — nothing more we can do here
        });
      return;
    }
    void dispatch(qr.value, msgId);
  }

  function onSend() {
    if (isBusyRef.current) return;
    bumpInteraction();
    const text = input;
    setInput("");
    void dispatch(text);
  }

  const collapsedStatus = chat.hasUnfinishedWork && chat.step !== "done" ? s.collapsedPending : s.collapsedIdle;

  return (
    <>
      {/* Floating anchor button — only visible while the panel is fully closed. */}
      {drag.panelState === "closed" && (
        <button
          onClick={() => drag.open("full")}
          aria-label="Captain Harbor"
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-harbor-navy text-harbor-mist shadow-glow-blue"
        >
          <Image src="/captain-harbor.svg" alt="Captain Harbor" width={30} height={30} priority unoptimized />
          {chat.hasUnfinishedWork && chat.step !== "done" && (
            <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-base-bg bg-harbor-orange" />
          )}
        </button>
      )}

      {drag.panelState !== "closed" && (
        <div
          ref={panelRef}
          role={drag.panelState === "full" || drag.panelState === "half" ? "dialog" : undefined}
          aria-modal={drag.panelState === "full" || drag.panelState === "half" ? true : undefined}
          aria-label={drag.panelState === "full" || drag.panelState === "half" ? "Captain Harbor" : undefined}
          className="fixed inset-x-0 z-40 flex flex-col overflow-hidden rounded-t-2xl border-t border-base-border bg-base-surface shadow-card"
          style={{
            top: drag.topStyle,
            bottom: 0,
            transition: drag.dragging ? "none" : "top 220ms cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {/* Grab handle — the ONLY drag target. Content below scrolls normally. */}
          <div
            {...drag.handlers}
            className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-1.5 pb-2 pt-2.5 active:cursor-grabbing"
          >
            <span
              className={`h-1.5 w-10 rounded-full transition-colors ${drag.pressed ? "bg-white" : "bg-ink-faint/50"}`}
            />
            {drag.panelState !== "collapsed" && (
              <div className="flex w-full items-center justify-between px-4">
                <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <Image src="/captain-harbor.svg" alt="" width={16} height={16} unoptimized />
                  Captain Harbor
                </div>
                <button
                  onClick={drag.close}
                  aria-label="close"
                  className="rounded-full p-1 text-ink-faint hover:bg-base-surface2 hover:text-ink"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
            )}
            {drag.panelState === "collapsed" && (
              <div className="px-4 text-xs text-ink-dim">{collapsedStatus}</div>
            )}
          </div>

          {drag.panelState !== "collapsed" && (
            <>
              <div
                ref={scrollRef}
                onDragOver={onChatDragOver}
                onDragLeave={onChatDragLeave}
                onDrop={onChatDrop}
                onPointerDown={bumpInteraction}
                className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-2"
              >
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    lang={lang}
                    disabled={isBusy}
                    skipSignal={interactionTick}
                    onQuickReply={(qr) => onQuickReply(m.id, qr)}
                  />
                ))}

                {/* Drop target overlay (P2 #14) — only while actively waiting
                    for a ZIP and a file is being dragged over the chat. */}
                {isDraggingFile && chat.step === "await_file" && (
                  <div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-harbor-orange bg-base-surface/90">
                    <p className="rounded-full bg-harbor-orange px-4 py-2 text-sm font-medium text-white shadow-glow-orange">
                      {s.dropZipHere}
                    </p>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-base-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={openFilePicker}
                    aria-label="attach zip"
                    disabled={isBusy}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-base-surface2 hover:text-ink disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Paperclip size={18} strokeWidth={2} />
                  </button>
                  <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={onFileInputChange} />
                  <input
                    ref={composerInputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      bumpInteraction();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSend();
                    }}
                    disabled={isBusy}
                    placeholder={s.composerPlaceholder}
                    className="min-w-0 flex-1 rounded-full border border-base-border bg-base-surface2 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-harbor-orange disabled:opacity-60"
                  />
                  <button
                    onClick={onSend}
                    aria-label="send"
                    disabled={isBusy}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-harbor-orange text-white disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Send size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function MessageBubble({
  msg,
  lang,
  disabled,
  skipSignal,
  onQuickReply,
}: {
  msg: ChatMessage;
  lang: "th" | "en";
  disabled?: boolean;
  skipSignal?: number;
  onQuickReply: (qr: QuickReply) => void;
}) {
  const isUser = msg.role === "user";

  // Typewriter effect (section 8) — opt-in via msg.animate, and never for
  // pending/steps bubbles (those are live status, not conversational copy;
  // see the `animate: true` call sites in CaptainHarbor for what actually
  // gets this treatment: home/help/GitHub-menu/Vercel-menu copy only).
  const shouldAnimate = !isUser && Boolean(msg.animate) && !msg.pending && !msg.steps;
  const fullText = msg.text || "";
  const [shownLength, setShownLength] = useState(shouldAnimate ? 0 : fullText.length);
  const [animDone, setAnimDone] = useState(!shouldAnimate);
  const mountSkipSignalRef = useRef(skipSignal);

  useEffect(() => {
    if (!shouldAnimate) {
      setShownLength(fullText.length);
      setAnimDone(true);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    setShownLength(0);
    setAnimDone(false);
    // Small delay before typing starts (section 9) so it reads as "about
    // to reply" rather than robotic instant character-spam.
    const startTimer = window.setTimeout(() => {
      let i = 0;
      const step = () => {
        if (cancelled) return;
        i += 1;
        setShownLength(i);
        if (i >= fullText.length) {
          setAnimDone(true);
          return;
        }
        timer = window.setTimeout(step, 18);
      };
      step();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText, shouldAnimate]);

  // Any interaction anywhere in the chat (tap, type, send, quick-reply)
  // after this bubble mounted skips straight to the full text — never
  // mid-character, and never re-triggered by state elsewhere in the chat
  // (this only reads shownLength/fullText local to this bubble).
  useEffect(() => {
    if (shouldAnimate && !animDone && skipSignal !== undefined && skipSignal !== mountSkipSignalRef.current) {
      setShownLength(fullText.length);
      setAnimDone(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipSignal]);

  const displayText = shouldAnimate ? fullText.slice(0, shownLength) : fullText;

  return (
    <div className={`mt-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        {msg.text && (
          <div
            onClick={() => {
              if (shouldAnimate && !animDone) {
                setShownLength(fullText.length);
                setAnimDone(true);
              }
            }}
            className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm ${
              isUser
                ? "bg-harbor-blue text-white"
                : "border border-base-border bg-base-surface2 text-ink"
            }`}
          >
            {msg.pending && (
              <Loader2 size={14} strokeWidth={2} className="mr-1.5 inline-block animate-spin align-[-2px] text-ink-faint" />
            )}
            {displayText}
          </div>
        )}

        {msg.steps && (
          <div className="mt-1.5 rounded-2xl border border-base-border bg-base-surface2 px-3.5 py-2.5">
            {msg.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5 text-xs text-ink-dim">
                {step.done ? (
                  <Check size={13} strokeWidth={2.5} className="text-accent-green" />
                ) : (
                  <Loader2 size={13} strokeWidth={2} className="animate-spin text-ink-faint" />
                )}
                {step.label}
              </div>
            ))}
          </div>
        )}

        {msg.quickReplies && !msg.repliesResolved && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.quickReplies.map((qr, i) => (
              <button
                key={i}
                onClick={() => onQuickReply(qr)}
                disabled={disabled}
                className={
                  (qr.tone === "ghost"
                    ? "rounded-full border border-base-border px-3 py-1.5 text-xs text-ink-dim hover:bg-base-surface2"
                    : qr.tone === "danger"
                      ? "rounded-full bg-accent-red/90 px-3 py-1.5 text-xs font-medium text-white"
                      : "rounded-full bg-harbor-orange px-3 py-1.5 text-xs font-medium text-white") +
                  " disabled:opacity-40 disabled:pointer-events-none"
                }
              >
                {qr.value.startsWith("__open__") ? (
                  <span className="inline-flex items-center gap-1">
                    {qr.label}
                    <ExternalLink size={11} strokeWidth={2} />
                  </span>
                ) : (
                  qr.label
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
