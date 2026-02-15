"use client";

import { useRef, useEffect } from "react";
import { Button } from "./button";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) return;

      e.preventDefault();
      inputRef.current?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") inputRef.current?.blur(); }}
        className="max-w-56 w-full border border-border bg-background px-2 py-1 text-xs text-foreground rounded placeholder:text-muted focus-visible:outline-none"
      />
      {value && (
        <Button onClick={() => onChange("")}>
          Clear
        </Button>
      )}
    </div>
  );
}
