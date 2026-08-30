import { LanguageSupport, syntaxTree } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { linter, Diagnostic } from "@codemirror/lint";
import { NodeType } from "@lezer/common";
import type { Extension, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Real-time error checking (build spec: "ตรวจทุกรูปแบบที่ทำได้ระหว่างเขียน").
 *
 * Rather than writing a bespoke syntax checker per language, this walks
 * the Lezer parse tree every language package below already builds for
 * highlighting, and reports any node the parser itself marked as
 * unparseable (⚠ error nodes) — no extra parser dependency, and it works
 * identically for every language on this list. JSON additionally gets
 * `jsonParseLinter`, which pinpoints the exact JSON.parse failure position
 * more precisely than a generic error-node walk can.
 *
 * This is honestly *syntax*-level checking, not semantic/type checking —
 * it won't catch "variable used before declaration" in JS or a wrong TS
 * type. Going further (e.g. running the TypeScript compiler in-browser)
 * is a real option but a much heavier dependency; left out of this pass.
 *
 * IMPORTANT pitfall this avoids: when a file has no language attached at
 * all (the "text" fallback below), `syntaxTree()` returns Lezer's shared
 * `Tree.empty`, whose single node has id 0 — and Lezer's own
 * `NodeType.isError` getter is defined as `id === 0`. Walking that empty
 * tree without checking for it flags *every single untyped file* as
 * having exactly one syntax error, which isn't a real error at all — it's
 * "we never parsed this file to begin with." collectSyntaxDiagnostics
 * checks for that placeholder explicitly and returns nothing for it.
 */

export interface CodeDiagnostic {
  from: number;
  to: number;
  line: number;
  col: number;
  message: string;
}

export function collectSyntaxDiagnostics(state: EditorState): CodeDiagnostic[] {
  const tree = syntaxTree(state);
  // No real language attached to this file (or Lezer handed back its
  // shared empty-tree sentinel) — nothing was actually parsed, so there's
  // nothing honest to report. See the pitfall note above.
  if (tree.type === NodeType.none || tree.length === 0) return [];

  const docLen = state.doc.length;
  const raw: CodeDiagnostic[] = [];
  const cursor = tree.cursor();
  do {
    if (!cursor.type.isError) continue;
    const from = cursor.from;
    if (from >= docLen) continue; // artifact right at end-of-document, not a real spot to point at
    const to = Math.min(cursor.to > from ? cursor.to : from + 1, docLen);
    const line = state.doc.lineAt(from);
    const snippet = state.doc.sliceString(from, Math.min(to, line.to, from + 24)).trim();
    raw.push({
      from,
      to,
      line: line.number,
      col: from - line.from + 1,
      message: snippet ? `Unexpected syntax near "${snippet}"` : "Unexpected syntax",
    });
  } while (cursor.next());

  // Lezer's error recovery frequently wraps one bad token in several
  // nested error nodes at (or overlapping) the same spot — only the
  // first/outermost one found in this top-down walk is worth surfacing.
  raw.sort((a, b) => a.from - b.from || a.to - b.to);
  const deduped: CodeDiagnostic[] = [];
  for (const d of raw) {
    const prev = deduped[deduped.length - 1];
    if (prev && d.from < prev.to) continue;
    deduped.push(d);
  }
  return deduped.slice(0, 100);
}

function syntaxErrorLinter() {
  return linter((view: EditorView): Diagnostic[] =>
    collectSyntaxDiagnostics(view.state).map((d) => ({ from: d.from, to: d.to, severity: "error", message: d.message }))
  );
}

export interface LanguageProfile {
  key: string;
  label: string;
  extension: () => Extension[];
}

const JS_EXTS = new Set(["js", "jsx", "mjs", "cjs"]);
const TS_EXTS = new Set(["ts", "tsx", "mts", "cts"]);

function profileFor(ext: string): LanguageProfile {
  if (JS_EXTS.has(ext)) {
    return { key: "javascript", label: "JavaScript", extension: () => [javascript({ jsx: ext === "jsx" }), syntaxErrorLinter()] };
  }
  if (TS_EXTS.has(ext)) {
    return {
      key: "typescript",
      label: "TypeScript",
      extension: () => [javascript({ jsx: ext === "tsx", typescript: true }), syntaxErrorLinter()],
    };
  }
  if (ext === "json" || ext === "jsonc") {
    return { key: "json", label: "JSON", extension: () => [json(), linter(jsonParseLinter()), syntaxErrorLinter()] };
  }
  if (ext === "css" || ext === "scss" || ext === "less") {
    return { key: "css", label: "CSS", extension: () => [css(), syntaxErrorLinter()] };
  }
  if (ext === "html" || ext === "htm" || ext === "vue" || ext === "svelte") {
    return { key: "html", label: "HTML", extension: () => [html(), syntaxErrorLinter()] };
  }
  if (ext === "md" || ext === "mdx" || ext === "markdown") {
    return { key: "markdown", label: "Markdown", extension: () => [markdown()] };
  }
  if (ext === "py") {
    return { key: "python", label: "Python", extension: () => [python(), syntaxErrorLinter()] };
  }
  return { key: "text", label: "Plain text", extension: () => [] };
}

export function extOf(path: string): string {
  const base = path.split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function languageForPath(path: string): LanguageProfile {
  return profileFor(extOf(path));
}

// Broad allowlist for "safe to open as text" — deliberately wider than the
// languages above (plenty of text files, .env/.gitignore/.yml/etc, are
// worth opening even with zero syntax highlighting/linting).
const TEXT_EXTS = new Set([
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts",
  "json", "jsonc", "css", "scss", "sass", "less",
  "html", "htm", "vue", "svelte", "md", "mdx", "markdown",
  "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs",
  "php", "sh", "bash", "zsh", "sql", "graphql", "gql",
  "yml", "yaml", "toml", "ini", "cfg", "conf", "env",
  "txt", "xml", "svg", "gitignore", "gitattributes", "editorconfig", "dockerfile", "prisma",
]);

export function isLikelyTextFile(path: string, sizeBytes: number): boolean {
  if (sizeBytes > 2 * 1024 * 1024) return false; // 2MB — editing anything bigger client-side is a bad time
  const ext = extOf(path);
  if (TEXT_EXTS.has(ext)) return true;
  const base = (path.split("/").pop() || "").toLowerCase();
  return base === "dockerfile" || base === "makefile" || base === ".gitignore" || base === ".env";
}
