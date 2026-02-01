"use client";

import { useMemo } from "react";
import { syntaxHighlighting, HighlightStyle, StreamLanguage } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { useCodeMirror } from "@/hooks/use-codemirror";

// Simple env file syntax highlighting
const envLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/^#.*/)) {
      return "comment";
    }
    if (stream.sol() && stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      return "propertyName";
    }
    if (stream.match(/^=/)) {
      return "punctuation";
    }
    stream.next();
    return "string";
  },
});

const envHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--foreground)" },
  { tag: tags.string, color: "var(--success)" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.punctuation, color: "var(--muted)" },
]);

interface EnvEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
}

export function EnvEditor({ value, onChange, readOnly = false, className = "" }: EnvEditorProps) {
  const extensions = useMemo(
    () => [envLanguage, syntaxHighlighting(envHighlightStyle)],
    []
  );

  const containerRef = useCodeMirror({
    value,
    onChange,
    readOnly,
    extensions,
  });

  return (
    <div
      ref={containerRef}
      className={`border border-border bg-background overflow-auto ${className}`}
    />
  );
}
