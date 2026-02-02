"use client";

import { ReactNode, useEffect, useCallback, useRef, useId } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  // Keep onClose ref updated without triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onCloseRef.current();
  }, []);

  // Focus trap: keep focus within modal
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  }, []);

  useEffect(() => {
    if (open) {
      // Store the currently focused element for restoration
      previousActiveElement.current = document.activeElement as HTMLElement;

      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";

      // Focus the modal container after render
      requestAnimationFrame(() => {
        modalRef.current?.focus();
      });
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";

      // Restore focus to the previously focused element
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
        previousActiveElement.current.focus();
      }
    };
  }, [open, handleEscape]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="relative z-10 w-full max-w-lg border border-border bg-background rounded shadow-lg outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <h3 id={titleId} className="font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted hover:text-foreground text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
