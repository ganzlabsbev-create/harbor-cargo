"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Zap, ScanSearch, AlertTriangle, File as FileIcon } from "lucide-react";
import { useLang } from "@/lib/i18n-context";

/**
 * Full-text code search (build spec: search *content*, not just
 * filenames — separate from the file tree's path search).
 *
 * Two modes:
 *  - "quick" — GitHub's own code search index. Debounced per keystroke,
 *    one network round trip per query, but default-branch-only and can
 *    lag slightly behind a very recent push.
 *  - "deep" — fetches every text file's content once (progress bar, same
 *    caps as Download Project), caches it in memory for this session, then
 *    every keystroke after that filters entirely client-side — exhaustive
 *    and works on any branch, at the cost of that one upfront fetch.
 */

interface QuickResult {
  path: string;
  fragments: string[];
}

interface DeepMatch {
  path: string;
  lines: { lineNo: number; text: string }[];
}

export default function CodeSearchPanel({
  owner,
  repo,
  branch,
  onOpenAtLine,
}: {
  owner: string;
  repo: string;
  branch: string;
  onOpenAtLine: (path: string, line?: number) => void;
}) {
  const { t } = useLang();
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [query, setQuery] = useState("");

  const [quickResults, setQuickResults] = useState<QuickResult[] | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const corpusRef = useRef<Map<string, string>>(new Map());
  const [corpusLoaded, setCorpusLoaded] = useState(false);
  const [corpusLoading, setCorpusLoading] = useState(false);
  const [corpusProgress, setCorpusProgress] = useState<{ current: number; total: number } | null>(null);
  const [corpusTruncated, setCorpusTruncated] = useState(false);
  const [deepMatches, setDeepMatches] = useState<DeepMatch[]>([]);

  // --- quick mode: debounced GitHub search --------------------------------
  useEffect(() => {
    if (mode !== "quick") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setQuickResults(null);
      setQuickError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setQuickLoading(true);
      setQuickError(null);
      try {
        const res = await fetch(`/api/github/${owner}/${repo}/code/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.detail || data.error);
        setQuickResults(data.results);
      } catch (err: any) {
        setQuickError(String(err?.message || err));
        setQuickResults(null);
      } finally {
        setQuickLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mode, query, owner, repo]);

  // --- deep mode: fetch corpus once, then filter locally ------------------
  async function loadCorpus() {
    setCorpusLoading(true);
    setCorpusProgress(null);
    corpusRef.current = new Map();
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/code/corpus?branch=${encodeURIComponent(branch)}`);
      if (!res.body) throw new Error("no_response_body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "file") corpusRef.current.set(evt.path, evt.content);
          else if (evt.type === "progress") setCorpusProgress({ current: evt.current, total: evt.total });
          else if (evt.type === "done") setCorpusTruncated(!!evt.truncated);
        }
      }
      setCorpusLoaded(true);
    } catch {
      // A failed deep fetch just leaves corpus empty — quick mode is still there as a fallback.
    } finally {
      setCorpusLoading(false);
    }
  }

  useEffect(() => {
    if (mode !== "deep" || corpusLoaded || corpusLoading) return;
    loadCorpus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "deep") return;
    const q = query.trim();
    if (!q) {
      setDeepMatches([]);
      return;
    }
    const needle = q.toLowerCase();
    const out: DeepMatch[] = [];
    for (const [path, content] of corpusRef.current) {
      const lines = content.split("\n");
      const hits: { lineNo: number; text: string }[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          hits.push({ lineNo: i + 1, text: lines[i].trim().slice(0, 200) });
          if (hits.length >= 5) break; // enough to show relevance without dumping a whole file
        }
      }
      if (hits.length > 0) out.push({ path, lines: hits });
      if (out.length >= 100) break;
    }
    setDeepMatches(out);
  }, [mode, query, corpusLoaded]);

  function openQuickResult(path: string) {
    // GitHub's search API gives snippet fragments, not a line number — do
    // a best-effort local locate once the file is open (see parent).
    onOpenAtLine(path, undefined);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("code_search_placeholder")}
            className="w-full rounded-xl border border-base-border bg-base-surface2 py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint"
          />
        </div>
      </div>

      <div className="mb-3 flex shrink-0 gap-2">
        <button
          onClick={() => setMode("quick")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
            mode === "quick" ? "border-harbor-orange bg-harbor-orange/10 text-harbor-orange" : "border-base-border text-ink-dim"
          }`}
        >
          <Zap size={13} /> {t("code_search_quick")}
        </button>
        <button
          onClick={() => setMode("deep")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
            mode === "deep" ? "border-harbor-orange bg-harbor-orange/10 text-harbor-orange" : "border-base-border text-ink-dim"
          }`}
        >
          <ScanSearch size={13} /> {t("code_search_deep")}
        </button>
      </div>

      {mode === "quick" && (
        <p className="mb-2 shrink-0 text-xs text-ink-faint">{t("code_search_quick_note")}</p>
      )}
      {mode === "deep" && corpusLoading && (
        <div className="mb-2 flex shrink-0 items-center gap-2 text-xs text-ink-dim">
          <Loader2 size={13} className="animate-spin" />
          {t("code_search_deep_loading")}
          {corpusProgress ? ` (${corpusProgress.current}/${corpusProgress.total})` : ""}
        </div>
      )}
      {mode === "deep" && corpusTruncated && (
        <p className="mb-2 flex shrink-0 items-center gap-1.5 text-xs text-harbor-orange">
          <AlertTriangle size={12} /> {t("code_search_deep_truncated")}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "quick" ? (
          quickLoading ? (
            <div className="flex items-center gap-2 px-1 py-3 text-sm text-ink-dim">
              <Loader2 size={14} className="animate-spin" /> {t("code_searching")}
            </div>
          ) : quickError ? (
            <p className="px-1 py-3 text-sm text-accent-red">{quickError}</p>
          ) : !quickResults ? (
            <p className="px-1 py-3 text-sm text-ink-faint">{t("code_search_empty_hint")}</p>
          ) : quickResults.length === 0 ? (
            <p className="px-1 py-3 text-sm text-ink-faint">{t("code_no_matches")}</p>
          ) : (
            quickResults.map((r) => (
              <button
                key={r.path}
                onClick={() => openQuickResult(r.path)}
                className="mb-2 flex w-full flex-col gap-1 rounded-xl border border-base-border bg-base-surface p-3 text-left"
              >
                <span className="flex items-center gap-1.5 truncate font-mono text-xs text-ink">
                  <FileIcon size={12} className="shrink-0 text-ink-faint" /> {r.path}
                </span>
                {r.fragments.slice(0, 2).map((f, i) => (
                  <span key={i} className="line-clamp-2 font-mono text-[11px] text-ink-faint">
                    {f}
                  </span>
                ))}
              </button>
            ))
          )
        ) : deepMatches.length === 0 ? (
          <p className="px-1 py-3 text-sm text-ink-faint">
            {query.trim() ? t("code_no_matches") : t("code_search_empty_hint")}
          </p>
        ) : (
          deepMatches.map((m) => (
            <div key={m.path} className="mb-2 rounded-xl border border-base-border bg-base-surface p-3">
              <p className="mb-1.5 flex items-center gap-1.5 truncate font-mono text-xs text-ink">
                <FileIcon size={12} className="shrink-0 text-ink-faint" /> {m.path}
              </p>
              {m.lines.map((l) => (
                <button
                  key={l.lineNo}
                  onClick={() => onOpenAtLine(m.path, l.lineNo)}
                  className="mb-0.5 flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left active:bg-base-surface2"
                >
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">{l.lineNo}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-dim">{l.text}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
