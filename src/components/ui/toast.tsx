"use client";

import { ReactNode } from "react";

interface ToastProps {
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
}

export function Toast({ children, actions, onClose }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 flex items-center gap-3 p-3 border border-border bg-surface rounded shadow-lg animate-toast-in">
      <div className="flex-1 text-sm">{children}</div>
      {(actions || onClose) && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground p-1"
              aria-label="Dismiss"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
