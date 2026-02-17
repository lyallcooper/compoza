"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

const FADE_DURATION = 300;

interface ToastProps {
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  /** Auto-dismiss after this many milliseconds */
  autoClose?: number;
}

export function Toast({ children, actions, onClose, autoClose }: ToastProps) {
  const [fading, setFading] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (autoClose && onCloseRef.current) {
      const fadeTimer = setTimeout(() => setFading(true), autoClose - FADE_DURATION);
      const closeTimer = setTimeout(() => onCloseRef.current?.(), autoClose);
      return () => { clearTimeout(fadeTimer); clearTimeout(closeTimer); };
    }
  }, [autoClose]);

  return (
    <div className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 flex items-center gap-3 p-3 border border-border bg-surface rounded shadow-lg animate-toast-in transition-opacity duration-300 ${fading ? "opacity-0" : ""}`}>
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
