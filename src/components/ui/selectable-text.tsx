"use client";

import { useCallback, useRef, ReactNode } from "react";

interface SelectableTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper component that selects all its text content when clicked.
 * Useful for IDs, hashes, and other values users commonly copy.
 */
export function SelectableText({ children, className }: SelectableTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  const handleClick = useCallback(() => {
    if (!ref.current) return;

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(ref.current);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  return (
    <span
      ref={ref}
      onClick={handleClick}
      className={`cursor-pointer hover:bg-surface rounded-sm ${className || ""}`}
    >
      {children}
    </span>
  );
}
