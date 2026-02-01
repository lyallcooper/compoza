"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Custom highlight style using our theme colors
// Tags based on @lezer/yaml highlighting definitions
const customHighlightStyle = HighlightStyle.define([
  // Keys (property names)
  { tag: tags.definition(tags.propertyName), color: "var(--accent)" },
  { tag: tags.propertyName, color: "var(--accent)" },
  // Strings and values
  { tag: tags.string, color: "var(--success)" },
  { tag: tags.content, color: "var(--foreground)" },
  { tag: tags.attributeValue, color: "var(--success)" },
  // Special syntax
  { tag: tags.keyword, color: "var(--warning)" },
  { tag: tags.typeName, color: "var(--warning)" },
  { tag: tags.labelName, color: "var(--warning)" },
  // Comments
  { tag: tags.lineComment, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
  // Punctuation and structure
  { tag: tags.separator, color: "var(--muted)" },
  { tag: tags.punctuation, color: "var(--muted)" },
  { tag: tags.squareBracket, color: "var(--muted)" },
  { tag: tags.brace, color: "var(--muted)" },
  { tag: tags.meta, color: "var(--muted)" },
]);

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
}

export function YamlEditor({ value, onChange, readOnly = false, className = "" }: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const theme = EditorView.theme({
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

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        yaml(),
        syntaxHighlighting(customHighlightStyle),
        keymap.of([...defaultKeymap, indentWithTab]),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
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
  }, [readOnly]); // Only recreate on readOnly change

  // Update content when value changes externally
  useEffect(() => {
    if (viewRef.current) {
      const currentValue = viewRef.current.state.doc.toString();
      if (currentValue !== value) {
        viewRef.current.dispatch({
          changes: { from: 0, to: currentValue.length, insert: value },
        });
      }
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={`border border-border bg-background overflow-auto ${className}`}
    />
  );
}
