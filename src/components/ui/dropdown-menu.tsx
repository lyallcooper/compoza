"use client";

import { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

interface DropdownMenuProps {
  label?: string;
  children: ReactNode;
  className?: string;
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Tooltip shown when item is disabled - explains why it's disabled */
  disabledReason?: string;
  variant?: "default" | "danger" | "accent";
  loading?: boolean;
}

export function DropdownMenu({ label = "Actions", children, className = "" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
      setOpen(false);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, handleClickOutside]);

  return (
    <div ref={menuRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <Button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="whitespace-nowrap"
      >
        {label} <span className="ml-1" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </Button>
      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-1 min-w-[160px] bg-background border border-border rounded shadow-lg z-50"
        >
          <div className="py-1" onClick={() => setOpen(false)}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, disabled, disabledReason, variant = "default", loading }: DropdownItemProps) {
  const isDisabled = disabled || loading;
  const variantClasses = {
    default: "hover:bg-surface",
    danger: "text-error hover:bg-error-muted",
    accent: "text-accent hover:bg-accent-muted",
  }[variant];

  const button = (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={isDisabled}
      className={`w-full text-left px-3 py-2 text-sm ${variantClasses} disabled:opacity-50 disabled:cursor-not-allowed ${disabledReason ? "disabled:pointer-events-none" : ""} focus:outline-none focus:bg-surface`}
    >
      {loading ? "..." : children}
    </button>
  );

  // Wrap in Tooltip to show reason on disabled items (disabled elements don't fire pointer events)
  if (isDisabled && disabledReason) {
    return (
      <Tooltip content={disabledReason} className="block">
        {button}
      </Tooltip>
    );
  }

  return button;
}
