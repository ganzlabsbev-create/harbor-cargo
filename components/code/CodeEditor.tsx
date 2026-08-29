"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, Extension, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter, syntaxTree } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { lintGutter } from "@codemirror/lint";
import { languageForPath } from "@/lib/code-lang";
import { harborCodeMirrorTheme } from "@/lib/code-theme";

/**
 * A minimal hand-rolled CodeMirror 6 binding instead of pulling in
 * @uiw/react-codemirror — the whole wrapper is ~60 lines of direct
 * @codemirror/* calls, so it wasn't worth one more dependency on top of
 * the CodeMirror packages themselves.
 */
export interface CodeEditorHandle {
  scrollToLine: (line: number) => void;
}

const CodeEditor = forwardRef<CodeEditorHandle, {
  path: string;
  value: string;
  onChange: (next: string) => void;
  onCursor?: (info: { line: number; col: number; errorCount: number }) => void;
  readOnly?: boolean;
}>(function CodeEditor({ path, value, onChange, onCursor, readOnly = false }, forwardedRef) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursor);
  onChangeRef.current = onChange;
  onCursorRef.current = onCursor;

  // Mount once per file path — CodeMirror manages its own document/undo
  // history internally, so a full remount on path change is the simplest
  // way to guarantee stale state from the previous file never leaks in.
  useEffect(() => {
    if (!hostRef.current) return;
    const lang = languageForPath(path);

    function reportCursor(view: EditorView) {
      if (!onCursorRef.current) return;
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      const tree = syntaxTree(view.state);
      let errorCount = 0;
      const cursor = tree.cursor();
      do {
        if (cursor.type.isError) errorCount++;
      } while (cursor.next());
      onCursorRef.current({ line: line.number, col: pos - line.from + 1, errorCount });
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        foldGutter(),
        autocompletion(),
        highlightSelectionMatches(),
        search(),
        lintGutter(),
        languageCompartment.current.of(lang.extension()),
        harborCodeMirrorTheme(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, ...searchKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) reportCursor(update.view);
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    reportCursor(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // External updates (e.g. reverting to the saved version) without losing
  // undo history on every keystroke — only resync when `value` changed
  // from *outside* the editor (the diff check avoids an infinite loop
  // against our own onChange).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useImperativeHandle(forwardedRef, () => ({
    scrollToLine: (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const clamped = Math.max(1, Math.min(line, view.state.doc.lines));
      const lineInfo = view.state.doc.line(clamped);
      view.dispatch({
        selection: { anchor: lineInfo.from },
        effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
      });
      view.focus();
    },
  }));

  return <div ref={hostRef} className="h-full w-full overflow-auto" />;
});

export default CodeEditor;
