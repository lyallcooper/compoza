"use client";

import { useMemo } from "react";
import { yaml } from "@codemirror/lang-yaml";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { useCodeMirror } from "@/hooks/use-codemirror";

// Custom highlight style using our theme colors
const yamlHighlightStyle = HighlightStyle.define([
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
  const extensions = useMemo(
    () => [yaml(), syntaxHighlighting(yamlHighlightStyle)],
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
