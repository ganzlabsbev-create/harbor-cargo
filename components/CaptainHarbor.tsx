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
// Only "github" has a working flow today; other providers show a
// "coming soon" message per the plan (new ones can be wired in later by
// extending LIVE_PROVIDERS in lib/captain-harbor/types.ts and adding a
// branch to runAction()/handleFile() below).

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { usePathname } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { nanoid } from "nanoid";
import { Anchor, X, Paperclip, Send, Check, Loader2, ExternalLink } from "lucide-react";
import { useLang } from "@/lib/i18n-context";
import { useDragPanel } from "@/lib/use-drag-panel";
import {
  cap,
  PROVIDER_LABEL,
  parseProvider,
  isCancelWord,
  isHelpWord,
} from "@/lib/captain-harbor/strings";
import {
  KNOWN_PROVIDERS,
  LIVE_PROVIDERS,
  initialChatState,
  type ChatMessage,
  type ChatState,
  type Provider,
  type QuickReply,
} from "@/lib/captain-harbor/types";

const MAX_ZIP_BYTES = 200 * 1024 * 1024;

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Greet once, the first time the panel is opened — and if the user
  // opened it from a page that implies a provider (e.g. /tools/github),
  // offer that as a shortcut instead of asking from scratch.
  useEffect(() => {
    if (drag.panelState === "closed" || greeted) return;
    setGreeted(true);
    if (pageProvider && LIVE_PROVIDERS.includes(pageProvider)) {
      addMsg({
        role: "bot",
        text: s.greetingWithContext(PROVIDER_LABEL[pageProvider]),
        quickReplies: [
          { label: PROVIDER_LABEL[pageProvider], value: pageProvider, tone: "primary" },
          { label: s.helpMenu, value: "help", tone: "ghost" },
        ],
      });
      setChat((c) => ({ ...c, step: "await_provider" }));
    } else {
      addMsg({ role: "bot", text: s.greeting });
      setChat((c) => ({ ...c, step: "await_provider" }));
      showProviderMenu();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.panelState]);

  function showProviderMenu() {
    addMsg({
      role: "bot",
      text: s.helpMenu,
      quickReplies: KNOWN_PROVIDERS.map((p) => ({
        label: PROVIDER_LABEL[p],
        value: p,
        tone: "primary" as const,
      })),
    });
  }

  function resetToIdle(sayCancelled: boolean) {
    setChat(initialChatState);
    if (sayCancelled) addMsg({ role: "bot", text: s.cancelled });
    showProviderMenu();
  }

  // ---- provider / action selection ------------------------------------

  function handleProviderInput(raw: string, sourceMsgId?: string) {
    if (sourceMsgId) resolveReplies(sourceMsgId);
    const provider = parseProvider(raw);
    if (!provider) {
      addMsg({ role: "bot", text: s.unknownProvider });
      showProviderMenu();
      return;
    }
    if (!LIVE_PROVIDERS.includes(provider)) {
      addMsg({ role: "bot", text: s.providerComingSoon(PROVIDER_LABEL[provider]) });
      showProviderMenu();
      return;
    }
    setChat((c) => ({ ...c, provider, step: "await_action" }));
    const id = addMsg({
      role: "bot",
      text: s.providerSelected(PROVIDER_LABEL[provider]),
      quickReplies: [
        { label: s.actionCreate, value: "create", tone: "primary" },
        { label: s.actionUpdate, value: "update", tone: "primary" },
        { label: s.cancel, value: "cancel", tone: "ghost" },
      ],
    });
    void id;
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

    const authed = await checkAuth();
    if (!authed) {
      addMsg({
        role: "bot",
        text: s.needLogin,
        quickReplies: [{ label: s.loginButton, value: "__login__", tone: "primary" }],
      });
      return;
    }

    setChat((c) => ({ ...c, action, step: "await_file", hasUnfinishedWork: true }));
    addMsg({ role: "bot", text: action === "update" ? s.askZipForUpdate : s.askZipForCreate });
  }

  async function checkAuth(): Promise<boolean> {
    try {
      const res = await fetch("/api/me");
      return res.ok;
    } catch {
      return false;
    }
  }

  // ---- file upload -------------------------------------------------------

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFile(file: File) {
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
        updateMsg(pendingId, { text: s.errorGeneric, pending: false });
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
        updateMsg(pendingId, { text: data.error === "invalid_zip" ? s.errorNotZip : s.errorGeneric, pending: false });
        return;
      }

      updateMsg(pendingId, { text: s.foundFiles(data.fileCount), pending: false });
      setChat((c) => ({
        ...c,
        blobUrl: blobResult.url,
        blobPathname: blobResult.pathname,
        fileName: file.name,
        fileCount: data.fileCount,
      }));

      if (chat.action === "create") {
        setChat((c) => ({ ...c, step: "await_repo_name" }));
        addMsg({ role: "bot", text: s.askRepoName });
      } else {
        await goToRepoPick();
      }
    } catch {
      updateMsg(pendingId, { text: s.errorGeneric, pending: false });
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (chat.step !== "await_file") {
      addMsg({ role: "bot", text: s.waitingForFileNudge });
      return;
    }
    void handleFile(file);
  }

  // ---- repo resolution (update flow) -------------------------------------

  async function goToRepoPick() {
    setChat((c) => ({ ...c, step: "await_repo_pick" }));
    const pendingId = addMsg({ role: "bot", text: s.checkingRateLimit, pending: true });
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.repos) || data.repos.length === 0) {
        updateMsg(pendingId, { text: s.noReposFound, pending: false });
        return;
      }
      const top = data.repos.slice(0, 6);
      updateMsg(pendingId, {
        text: s.askWhichRepo,
        pending: false,
        quickReplies: [
          ...top.map((r: any) => ({ label: r.full_name, value: r.full_name, tone: "primary" as const })),
          { label: s.cancel, value: "cancel", tone: "ghost" as const },
        ],
      });
    } catch {
      updateMsg(pendingId, { text: s.errorGeneric, pending: false });
    }
  }

  async function handleRepoPick(raw: string, sourceMsgId?: string) {
    if (sourceMsgId) resolveReplies(sourceMsgId);
    const fullName = raw.trim();
    const [owner, repo] = fullName.includes("/") ? fullName.split("/") : [null, fullName];
    if (!owner || !repo) {
      addMsg({ role: "bot", text: s.repoNotFound(fullName) });
      return;
    }

    setChat((c) => ({ ...c, owner, repo }));
    const pendingId = addMsg({ role: "bot", text: s.checkingRateLimit, pending: true });
    try {
      const reposRes = await fetch("/api/repos");
      const reposData = await reposRes.json();
      const match = (reposData.repos || []).find((r: any) => r.full_name.toLowerCase() === fullName.toLowerCase());
      if (!match) {
        updateMsg(pendingId, { text: s.repoNotFound(fullName), pending: false });
        return;
      }
      const branch = match.default_branch || "main";
      updateMsg(pendingId, { text: s.foundRepo(fullName), pending: false });
      setChat((c) => ({ ...c, branch, step: "comparing" }));
      await runDiff(owner, repo, branch);
    } catch {
      updateMsg(pendingId, { text: s.errorGeneric, pending: false });
    }
  }

  async function runDiff(owner: string, repo: string, branch: string) {
    try {
      const res = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: chat.blobUrl, blobPathname: chat.blobPathname, owner, repo, branch }),
      });
      const data = await res.json();
      if (!data.ok) {
        addMsg({ role: "bot", text: s.errorGeneric });
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
      setChat((c) => ({ ...c, preview, step: "await_confirm" }));
      addMsg({
        role: "bot",
        text: `${s.previewIntro}\n🟢 +${preview.added.length}  🟡 ~${preview.modified.length}  🔴 -${preview.removed.length}\n${s.previewBranch(branch)}\n${s.previewOutro}`,
        preview,
        quickReplies: [
          { label: s.confirmGo, value: "confirm", tone: "primary" },
          { label: s.cancel, value: "cancel", tone: "ghost" },
        ],
      });
    } catch {
      addMsg({ role: "bot", text: s.errorGeneric });
    }
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
        { label: s.createGo, value: "confirm", tone: "primary" },
        { label: s.cancel, value: "cancel", tone: "ghost" },
      ],
    });
  }

  // ---- execute ------------------------------------------------------------

  async function handleConfirm(sourceMsgId?: string) {
    if (sourceMsgId) resolveReplies(sourceMsgId);
    setChat((c) => ({ ...c, step: "executing" }));

    const isUpdate = chat.action === "update";
    const stepLabels = isUpdate
      ? [s.stepUpload, s.stepUpdateFiles, s.stepRemoveFiles, s.stepCommit]
      : [s.stepUpload, s.stepCreateRepo, s.stepPushFiles];

    const execId = addMsg({
      role: "bot",
      text: isUpdate ? s.executingUpdate : s.executingCreate,
      steps: stepLabels.map((label) => ({ label, done: false })),
    });

    // Step 1 (upload) is already done by the time we get here.
    updateMsg(execId, { steps: stepLabels.map((label, i) => ({ label, done: i === 0 })) });

    try {
      const body: any = { blobUrl: chat.blobUrl, blobPathname: chat.blobPathname, mode: chat.action };
      if (isUpdate) {
        body.owner = chat.owner;
        body.repo = chat.repo;
        body.commitMessage = "Update via Captain Harbor";
      } else {
        body.repoName = chat.repo;
        body.private = true;
      }

      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.ok) {
        updateMsg(execId, { text: s.errorGeneric, steps: undefined });
        setChat((c) => ({ ...c, step: "await_confirm" }));
        return;
      }

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
      updateMsg(execId, { text: s.errorGeneric, steps: undefined });
      setChat((c) => ({ ...c, step: "await_confirm" }));
    }
  }

  // ---- top-level dispatcher ------------------------------------------------

  async function dispatch(raw: string, sourceMsgId?: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (trimmed === "__login__") {
      window.location.href = "/api/auth/github";
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

    addMsg({ role: "user", text: trimmed === "cancel" ? s.cancel : trimmed });

    // Global commands work from any step.
    if (isCancelWord(trimmed) && chat.step !== "idle") {
      resetToIdle(true);
      return;
    }
    if (isHelpWord(trimmed)) {
      showProviderMenu();
      return;
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
    void dispatch(qr.value, msgId);
  }

  function onSend() {
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
          <Anchor size={24} strokeWidth={2} />
          {chat.hasUnfinishedWork && chat.step !== "done" && (
            <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-base-bg bg-harbor-orange" />
          )}
        </button>
      )}

      {drag.panelState !== "closed" && (
        <div
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
                  <Anchor size={15} strokeWidth={2} className="text-harbor-orange" />
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
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} lang={lang} onQuickReply={(qr) => onQuickReply(m.id, qr)} />
                ))}
              </div>

              <div className="shrink-0 border-t border-base-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={openFilePicker}
                    aria-label="attach zip"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-base-surface2 hover:text-ink"
                  >
                    <Paperclip size={18} strokeWidth={2} />
                  </button>
                  <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={onFileInputChange} />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSend();
                    }}
                    placeholder={s.composerPlaceholder}
                    className="min-w-0 flex-1 rounded-full border border-base-border bg-base-surface2 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-harbor-orange"
                  />
                  <button
                    onClick={onSend}
                    aria-label="send"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-harbor-orange text-white"
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
  onQuickReply,
}: {
  msg: ChatMessage;
  lang: "th" | "en";
  onQuickReply: (qr: QuickReply) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`mt-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        {msg.text && (
          <div
            className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm ${
              isUser
                ? "bg-harbor-blue text-white"
                : "border border-base-border bg-base-surface2 text-ink"
            }`}
          >
            {msg.pending && (
              <Loader2 size={14} strokeWidth={2} className="mr-1.5 inline-block animate-spin align-[-2px] text-ink-faint" />
            )}
            {msg.text}
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
                className={
                  qr.tone === "ghost"
                    ? "rounded-full border border-base-border px-3 py-1.5 text-xs text-ink-dim hover:bg-base-surface2"
                    : qr.tone === "danger"
                      ? "rounded-full bg-accent-red/90 px-3 py-1.5 text-xs font-medium text-white"
                      : "rounded-full bg-harbor-orange px-3 py-1.5 text-xs font-medium text-white"
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
