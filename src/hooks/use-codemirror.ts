"use client";

import { useEffect, useRef } from "react";
import { Extension, Annotation, Transaction, Prec } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";

// Annotation to mark transactions as external syncs (shouldn't affect history)
const externalSync = Annotation.define<boolean>();

// Custom Enter handler for YAML-style indentation
// Workaround for lang-yaml indentation bug
const continueIndentKeymap = Prec.highest(
  keymap.of([
    {
      key: "Enter",
      run: (view) => {
        const { state } = view;
        const { from, to } = state.selection.main;
        const line = state.doc.lineAt(from);
        const textBeforeCursor = line.text.slice(0, from - line.from);
        const baseIndent = line.text.match(/^[ \t]*/)?.[0] || "";

        // If line ends with colon (before cursor), add one indent level
        const trimmed = textBeforeCursor.trimEnd();
        const indent = trimmed.endsWith(":")
          ? baseIndent + "  "
          : baseIndent;

        view.dispatch({
          changes: { from, to, insert: "\n" + indent },
          selection: { anchor: from + 1 + indent.length },
        });
        return true;
      },
    },
  ])
);

/**
 * Shared CodeMirror theme matching our design system
 */
export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "8px 0",
  },
  ".cm-line": {
    padding: "0 8px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--muted)",
    border: "none",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--accent-muted)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--surface)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--accent-muted) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--accent-muted) !important",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent)",
  },
});

interface UseCodeMirrorOptions {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  extensions: Extension[];
}

/**
 * Custom hook for creating a CodeMirror editor instance.
 * Returns a ref to attach to the container element.
 */
export function useCodeMirror({
  value,
  onChange,
  readOnly = false,
  extensions,
}: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        continueIndentKeymap,
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        indentUnit.of("  "),
        ...extensions,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        editorTheme,
        EditorView.updateListener.of((update) => {
          // Only call onChange for user edits, not external syncs
          if (update.docChanged && !update.transactions.some(t => t.annotation(externalSync))) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorState.readOnly.of(readOnly),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value is intentionally excluded; external value changes are handled by the separate sync effect below
  }, [readOnly, extensions]);

  // Sync external value changes (e.g., reset from server)
  // Uses annotations to avoid triggering onChange and to skip undo history
  useEffect(() => {
    if (viewRef.current) {
      const currentValue = viewRef.current.state.doc.toString();
      if (currentValue !== value) {
        viewRef.current.dispatch({
          changes: { from: 0, to: currentValue.length, insert: value },
          annotations: [
            externalSync.of(true),
            Transaction.addToHistory.of(false),
          ],
        });
      }
    }
  }, [value]);

  return containerRef;
}
