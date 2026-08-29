import { LanguageSupport, syntaxTree } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { linter, Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
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
 */
function syntaxErrorLinter() {
  return linter((view: EditorView): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const tree = syntaxTree(view.state);
    const cursor = tree.cursor();
    do {
      if (cursor.type.isError) {
        const from = cursor.from;
        const to = Math.max(cursor.to, from + 1);
        if (to <= view.state.doc.length) {
          diagnostics.push({ from, to, severity: "error", message: "Syntax error" });
        }
      }
    } while (cursor.next());
    // Cap so a truly malformed file (every node flagged) doesn't flood the
    // gutter — the first handful already tells you where to start.
    return diagnostics.slice(0, 50);
  });
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
