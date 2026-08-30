import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * A CodeMirror theme built from Harbor Cargo's existing Tailwind tokens
 * (tailwind.config.ts) instead of pulling in a prepackaged CodeMirror
 * theme — so the editor actually looks like the rest of the app rather
 * than a bolted-on widget.
 */
const colors = {
  bg: "#0A1930", // base.surface
  bgActiveLine: "#101F3B", // base.surface2
  border: "#1C2E4D", // base.border
  ink: "#F5F7FA",
  inkDim: "#B7C2D6",
  inkFaint: "#7C8AA5",
  orange: "#FA6522", // harbor.orange
  blue: "#4C9AFF", // brightened harbor.blue for AA contrast on dark bg
  green: "#4ADE80", // accent.green, brightened for text use
  red: "#F87171", // accent.red, brightened for text use
  purple: "#C084FC",
  gutterBg: "#071429",
};

export const harborEditorTheme = EditorView.theme(
  {
    "&": { color: colors.ink, backgroundColor: colors.bg, height: "100%", fontSize: "15px" },
    ".cm-content": { caretColor: colors.orange, fontFamily: "var(--font-mono, ui-monospace, monospace)", padding: "10px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: colors.orange },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(250,101,34,0.5)",
    },
    ".cm-panels": { backgroundColor: colors.gutterBg, color: colors.ink },
    // The in-file find panel (opened via the toolbar search icon) sits as a
    // floating overlay pinned to the top of the editor pane instead of
    // pushing content down, so it reads as a dropdown rather than a
    // permanent extra row.
    ".cm-panels.cm-panels-top": {
      position: "sticky",
      top: "0",
      zIndex: "20",
      borderBottom: `1px solid ${colors.border}`,
      boxShadow: "0 8px 16px -8px rgba(0,0,0,0.55)",
    },
    ".cm-search": { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", padding: "8px" },
    ".cm-search input.cm-textfield": {
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "8px",
      color: colors.ink,
      padding: "5px 8px",
    },
    ".cm-search button.cm-button": {
      backgroundColor: colors.bgActiveLine,
      border: `1px solid ${colors.border}`,
      borderRadius: "8px",
      color: colors.inkDim,
      padding: "4px 8px",
    },
    ".cm-search label": { color: colors.inkFaint, fontSize: "12px" },
    ".cm-searchMatch": { backgroundColor: "rgba(76,154,255,0.25)", outline: `1px solid ${colors.blue}` },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(250,101,34,0.35)" },
    ".cm-activeLine": { backgroundColor: colors.bgActiveLine },
    ".cm-activeLineGutter": { backgroundColor: colors.bgActiveLine, color: colors.ink },
    ".cm-gutters": { backgroundColor: colors.gutterBg, color: colors.inkFaint, border: "none", borderRight: `1px solid ${colors.border}` },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 12px" },
    ".cm-foldPlaceholder": { backgroundColor: colors.bgActiveLine, border: `1px solid ${colors.border}`, color: colors.inkDim },
    ".cm-tooltip": { backgroundColor: colors.gutterBg, border: `1px solid ${colors.border}`, color: colors.ink },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "rgba(250,101,34,0.2)", color: colors.ink },
    ".cm-diagnostic-error": { borderLeft: `3px solid ${colors.red}`, backgroundColor: "rgba(248,113,113,0.08)" },
    // A real red squiggly (SVG zigzag), not just a faint dashed line —
    // needs to be genuinely visible at a glance, not something you have to
    // already know is there to notice.
    ".cm-lintRange-error": {
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='3'><path d='M0 2.5 l1.5 -2 l1.5 2 l1.5 -2 l1.5 2' stroke='%23F87171' fill='none' stroke-width='1'/></svg>\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "0 bottom",
      paddingBottom: "1px",
    },
    ".cm-matchingBracket": { backgroundColor: "rgba(76,154,255,0.25)", outline: `1px solid ${colors.blue}` },
  },
  { dark: true }
);

export const harborHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: colors.blue },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: colors.ink },
  { tag: [t.function(t.variableName), t.labelName], color: colors.orange },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: colors.purple },
  { tag: [t.definition(t.name), t.separator], color: colors.ink },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: colors.purple },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: colors.blue },
  { tag: [t.meta, t.comment], color: colors.inkFaint, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: colors.blue, textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: colors.orange },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: colors.orange },
  { tag: [t.processingInstruction, t.string, t.inserted], color: colors.green },
  { tag: t.invalid, color: colors.red },
]);

export function harborCodeMirrorTheme() {
  return [harborEditorTheme, syntaxHighlighting(harborHighlightStyle)];
}
