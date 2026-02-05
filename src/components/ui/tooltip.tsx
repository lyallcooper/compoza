"use client";

import { ReactNode, useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children: ReactNode;
  /** Additional class name for the wrapper */
  className?: string;
}

/** Check if device supports touch */
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

const VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 4;

/**
 * Tooltip component that works on both desktop (hover) and mobile (tap).
 * Uses fixed positioning via portal for reliable placement.
 */
export function Tooltip({ content, children, className = "" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showTooltip = useCallback(() => {
    clearTimeoutRef();
    setVisible(true);
  }, [clearTimeoutRef]);

  const hideTooltip = useCallback(() => {
    clearTimeoutRef();
    setVisible(false);
  }, [clearTimeoutRef]);

  const hideWithDelay = useCallback(() => {
    clearTimeoutRef();
    timeoutRef.current = setTimeout(() => setVisible(false), 150);
  }, [clearTimeoutRef]);

  // Calculate and apply position after tooltip renders
  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current || !wrapperRef.current) return;

    const tooltip = tooltipRef.current;
    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Default: position above, centered
    let top = wrapperRect.top - tooltipRect.height - TOOLTIP_GAP;
    let left = wrapperRect.left + wrapperRect.width / 2 - tooltipRect.width / 2;
    let showBelow = false;

    // Flip to below if not enough space above
    if (top < VIEWPORT_PADDING) {
      top = wrapperRect.bottom + TOOLTIP_GAP;
      showBelow = true;
    }

    // Clamp horizontal position to viewport
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    } else if (left + tooltipRect.width > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - VIEWPORT_PADDING - tooltipRect.width;
    }

    // Calculate arrow position (centered on the trigger element)
    const arrowLeft = wrapperRect.left + wrapperRect.width / 2 - left;

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.dataset.position = showBelow ? "below" : "above";

    const arrow = tooltip.querySelector("[data-arrow]") as HTMLElement;
    if (arrow) {
      arrow.style.left = `${arrowLeft}px`;
    }
  }, [visible, content]);

  // Handle click outside to close on mobile
  useEffect(() => {
    if (!visible || !isTouchDevice()) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        hideTooltip();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [visible, hideTooltip]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeoutRef();
  }, [clearTimeoutRef]);

  const handleClick = (e: React.MouseEvent) => {
    if (isTouchDevice()) {
      e.preventDefault();
      setVisible((v) => !v);
    }
  };

  const isTouch = isTouchDevice();

  return (
    <span
      ref={wrapperRef}
      className={`inline-block ${className}`}
      onMouseEnter={!isTouch ? showTooltip : undefined}
      onMouseLeave={!isTouch ? hideWithDelay : undefined}
      onClick={handleClick}
    >
      {children}
      {visible && typeof window !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="fixed px-2 py-1 text-xs text-background bg-foreground rounded whitespace-nowrap z-[9999] pointer-events-none"
        >
          {content}
          <span
            data-arrow
            className="absolute -translate-x-1/2 border-4 border-transparent [[data-position=above]_&]:top-full [[data-position=above]_&]:border-t-foreground [[data-position=below]_&]:bottom-full [[data-position=below]_&]:border-b-foreground"
          />
        </div>,
        document.body
      )}
    </span>
  );
}
