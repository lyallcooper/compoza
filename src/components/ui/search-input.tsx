"use client";

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
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
