"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { Button } from "./button";

interface DropdownMenuProps {
  label?: string;
  children: ReactNode;
  className?: string;
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
  loading?: boolean;
}

export function DropdownMenu({ label = "Actions", children, className = "" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <Button onClick={() => setOpen(!open)}>
        {label} <span className="ml-1">{open ? "▴" : "▾"}</span>
      </Button>
      {open && (
        <div className="absolute right-0 mt-1 min-w-[160px] bg-background border border-border rounded shadow-lg z-50">
          <div className="py-1" onClick={() => setOpen(false)}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, disabled, variant = "default", loading }: DropdownItemProps) {
  const variantClasses = variant === "danger" ? "text-error hover:bg-error-muted" : "hover:bg-surface";

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full text-left px-3 py-2 text-sm ${variantClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {loading ? "..." : children}
    </button>
  );
}
