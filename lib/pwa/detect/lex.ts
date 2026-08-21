// A deliberately small, single-pass JS/TS lexer. It does not build a real
// AST — it only tracks which byte ranges of the source are inside a string,
// template literal, or comment. That's enough to answer the one question the
// detectors need: "does this match sit in code that actually runs, or in
// code that's just building a string (e.g. a generator emitting a Service
// Worker as a text template)?"
//
// This is intentionally conservative: nested template-literal interpolation
// (`${ ... }`) is treated as "back inside the enclosing template" rather
// than fully re-entering expression context, which is the safe direction to
// err in for our purposes (we'd rather under-trust a real match than
// over-trust a generated one).

export type SpanKind = "string" | "template" | "line-comment" | "block-comment";

export interface Span {
  kind: SpanKind;
  start: number;
  end: number; // exclusive
}

export function scanSpans(src: string): Span[] {
  const spans: Span[] = [];
  const len = src.length;
  let i = 0;

  while (i < len) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === "/" && next === "/") {
      const start = i;
      i += 2;
      while (i < len && src[i] !== "\n") i++;
      spans.push({ kind: "line-comment", start, end: i });
      continue;
    }

    if (ch === "/" && next === "*") {
      const start = i;
      i += 2;
      while (i < len && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(i + 2, len);
      spans.push({ kind: "block-comment", start, end: i });
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i++;
      while (i < len && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      i = Math.min(i + 1, len);
      spans.push({ kind: "string", start, end: i });
      continue;
    }

    if (ch === "`") {
      const start = i;
      i++;
      let depth = 0; // ${ ... } nesting inside the template
      while (i < len) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (depth === 0 && src[i] === "`") {
          i++;
          break;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          depth++;
          i += 2;
          continue;
        }
        if (depth > 0 && src[i] === "}") {
          depth--;
          i++;
          continue;
        }
        i++;
      }
      spans.push({ kind: "template", start, end: i });
      continue;
    }

    i++;
  }

  return spans;
}

/** True if `index` falls inside any string/template/comment span (i.e. not "live" top-level code). */
export function isInsideLiteralOrComment(spans: Span[], index: number): boolean {
  for (const s of spans) {
    if (index >= s.start && index < s.end) return true;
  }
  return false;
}

/** True if `index` falls specifically inside a template literal (backtick string). */
export function isInsideTemplate(spans: Span[], index: number): boolean {
  for (const s of spans) {
    if (s.kind === "template" && index >= s.start && index < s.end) return true;
  }
  return false;
}
