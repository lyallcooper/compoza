"use client";

import { useRef, useState, useLayoutEffect, useEffect, useCallback, forwardRef } from "react";
import { createPortal } from "react-dom";
import { SENSITIVE_MASK } from "@/lib/format";

interface TruncatedTextProps {
  text: string;
  maxLength?: number;        // Optional upper bound on characters shown
  selectable?: boolean;
  showPopup?: boolean;
  className?: string;
  popupDelay?: number;
  /** Whether this value is sensitive (e.g., password, secret) */
  sensitive?: boolean;
  /** Controlled reveal state for sensitive values */
  revealed?: boolean;
  /** Callback when reveal state changes */
  onRevealChange?: (revealed: boolean) => void;
}

interface PopupState {
  visible: boolean;
  pinned: boolean;
  rect: DOMRect | null;
}

export function TruncatedText({
  text,
  maxLength,
  selectable = true,
  showPopup = true,
  className,
  popupDelay = 500,
  sensitive = false,
  revealed = true,
  onRevealChange,
}: TruncatedTextProps) {
  // For sensitive values that aren't revealed, show mask
  const isHidden = sensitive && !revealed;
  const displaySourceText = isHidden ? SENSITIVE_MASK : text;
  const containerRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState(text);
  const [isTruncated, setIsTruncated] = useState(false);
  const [popup, setPopup] = useState<PopupState>({ visible: false, pinned: false, rect: null });
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Responsive truncation based on available width from constraining parent
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find the constraining parent - looks for data-truncate-container marker first,
    // then falls back to elements with overflow constraints
    const findConstrainingParent = (el: HTMLElement): HTMLElement => {
      let current = el.parentElement;

      // First pass: look for explicit data-truncate-container marker
      while (current) {
        if (current.hasAttribute("data-truncate-container")) {
          return current;
        }
        current = current.parentElement;
      }

      // Second pass: fall back to overflow-based detection
      current = el.parentElement;
      while (current) {
        const style = window.getComputedStyle(current);

        // Elements with overflow hidden/auto/scroll constrain children
        if (style.overflow === "hidden" || style.overflow === "auto" || style.overflow === "scroll") {
          return current;
        }

        current = current.parentElement;
      }

      return el.parentElement || el;
    };

    const constrainingParent = findConstrainingParent(container);

    const measureSpan = document.createElement("span");
    measureSpan.style.visibility = "hidden";
    measureSpan.style.position = "absolute";
    measureSpan.style.left = "-9999px";
    measureSpan.style.top = "0";
    measureSpan.style.whiteSpace = "nowrap";
    measureSpan.style.pointerEvents = "none";
    const styles = window.getComputedStyle(container);
    measureSpan.style.font = styles.font;
    measureSpan.style.fontSize = styles.fontSize;
    measureSpan.style.fontFamily = styles.fontFamily;
    document.body.appendChild(measureSpan);

    const calculateTruncation = () => {
      // Account for expand button and sensitive reveal/hide button
      const expandButtonWidth = showPopup ? 16 : 0;
      const sensitiveButtonWidth = sensitive ? 32 : 0;

      // Get available width from constraining parent
      const parentStyles = window.getComputedStyle(constrainingParent);
      const parentPadding = parseFloat(parentStyles.paddingLeft || "0") + parseFloat(parentStyles.paddingRight || "0");
      const availableWidth = constrainingParent.clientWidth - parentPadding;

      if (availableWidth <= 0) {
        setDisplayText(displaySourceText);
        setIsTruncated(false);
        return;
      }

      // Check if full text fits and is under maxLength
      measureSpan.textContent = displaySourceText;
      const textFitsInSpace = measureSpan.offsetWidth <= availableWidth - sensitiveButtonWidth;
      const textUnderMaxLength = !maxLength || displaySourceText.length <= maxLength;

      if (textFitsInSpace && textUnderMaxLength) {
        setDisplayText(displaySourceText);
        setIsTruncated(false);
        return;
      }

      // Calculate max chars to keep on each side
      const maxChars = maxLength
        ? Math.min(Math.floor(displaySourceText.length / 2), Math.floor((maxLength - 1) / 2))
        : Math.floor(displaySourceText.length / 2);

      // Binary search for optimal truncation
      const targetWidth = availableWidth - expandButtonWidth - sensitiveButtonWidth;
      let low = 1;
      let high = maxChars;
      let bestKeep = 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testStr = `${displaySourceText.slice(0, mid)}…${displaySourceText.slice(-mid)}`;
        measureSpan.textContent = testStr;

        if (measureSpan.offsetWidth <= targetWidth) {
          bestKeep = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      setDisplayText(`${displaySourceText.slice(0, bestKeep)}…${displaySourceText.slice(-bestKeep)}`);
      setIsTruncated(true);
    };

    calculateTruncation();

    // Observe constraining parent for size changes
    const resizeObserver = new ResizeObserver(calculateTruncation);
    resizeObserver.observe(constrainingParent);

    return () => {
      resizeObserver.disconnect();
      if (document.body.contains(measureSpan)) {
        document.body.removeChild(measureSpan);
      }
    };
  }, [displaySourceText, maxLength, showPopup, sensitive]);

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const selectText = useCallback(() => {
    if (!selectable || !containerRef.current) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(containerRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [selectable]);

  const openPopup = useCallback((pinned: boolean) => {
    if (!showPopup || !isTruncated || !containerRef.current) return;
    clearHoverTimeout();
    const rect = containerRef.current.getBoundingClientRect();
    setPopup({ visible: true, pinned, rect });
  }, [showPopup, isTruncated, clearHoverTimeout]);

  const closePopup = useCallback(() => {
    clearHoverTimeout();
    setPopup({ visible: false, pinned: false, rect: null });
  }, [clearHoverTimeout]);

  const handleMouseEnter = useCallback(() => {
    if (!showPopup || !isTruncated) return;
    // Cancel any pending close
    clearCloseTimeout();
    // Don't start hover timer if already pinned
    if (popup.pinned) return;
    clearHoverTimeout();
    hoverTimeoutRef.current = setTimeout(() => {
      // Double-check we're not pinned before opening
      setPopup((prev) => {
        if (prev.pinned) return prev;
        if (!containerRef.current) return prev;
        const rect = containerRef.current.getBoundingClientRect();
        return { visible: true, pinned: false, rect };
      });
    }, popupDelay);
  }, [showPopup, isTruncated, popup.pinned, popupDelay, clearHoverTimeout, clearCloseTimeout]);

  const handleMouseLeave = useCallback(() => {
    clearHoverTimeout();
    // Delay close to allow mouse to move to popup
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setPopup((prev) => {
        if (prev.pinned) return prev;
        return { visible: false, pinned: false, rect: null };
      });
    }, 150);
  }, [clearHoverTimeout, clearCloseTimeout]);

  const handleFocus = useCallback(() => {
    if (showPopup && isTruncated && !popup.pinned) {
      openPopup(false);
    }
  }, [showPopup, isTruncated, popup.pinned, openPopup]);

  const handleBlur = useCallback(() => {
    if (!popup.pinned) {
      closePopup();
    }
  }, [popup.pinned, closePopup]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closePopup();
    } else if (e.key === "Enter" && selectable) {
      selectText();
    }
  }, [closePopup, selectable, selectText]);

  const handleClick = useCallback(() => {
    selectText();
  }, [selectText]);

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    clearHoverTimeout();

    if (popup.visible && popup.pinned) {
      // Already pinned and visible - close it
      setPopup({ visible: false, pinned: false, rect: null });
    } else {
      // Open as pinned
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setPopup({ visible: true, pinned: true, rect });
    }
  }, [popup.visible, popup.pinned, clearHoverTimeout]);

  const handleRevealToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onRevealChange?.(!revealed);
  }, [revealed, onRevealChange]);

  const handlePopupClose = useCallback(() => {
    setPopup({ visible: false, pinned: false, rect: null });
  }, []);

  const handlePopupMouseEnter = useCallback(() => {
    clearCloseTimeout();
  }, [clearCloseTimeout]);

  const handlePopupMouseLeave = useCallback(() => {
    // Close after leaving popup (unless pinned)
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setPopup((prev) => {
        if (prev.pinned) return prev;
        return { visible: false, pinned: false, rect: null };
      });
    }, 150);
  }, [clearCloseTimeout]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      clearHoverTimeout();
      clearCloseTimeout();
    };
  }, [clearHoverTimeout, clearCloseTimeout]);

  // Handle click outside to close pinned popup
  useEffect(() => {
    if (!popup.visible || !popup.pinned) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const container = containerRef.current;
      const popupEl = popupRef.current;

      if (container && !container.contains(target) && popupEl && !popupEl.contains(target)) {
        setPopup({ visible: false, pinned: false, rect: null });
      }
    };

    // Delay to avoid closing from the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [popup.visible, popup.pinned]);

  const baseClasses = selectable ? "cursor-pointer hover:bg-surface rounded-sm" : "";
  const classes = className ? `${baseClasses} ${className}` : baseClasses;

  return (
    <span
      ref={containerRef}
      className={`inline-flex items-center whitespace-nowrap overflow-hidden max-w-full ${classes}`}
      title={isTruncated ? undefined : text}
      data-full-text={isTruncated ? text : undefined}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      tabIndex={isTruncated && showPopup ? 0 : undefined}
      role={isTruncated && showPopup ? "button" : undefined}
      aria-expanded={popup.visible}
    >
      <span>{displayText}</span>
      {isTruncated && showPopup && !isHidden && (
        <button
          type="button"
          onClick={handleExpandClick}
          className="ml-1 text-muted hover:text-foreground text-xs leading-none shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Show full text"
          tabIndex={-1}
        >
          +
        </button>
      )}
      {sensitive && (
        <button
          type="button"
          onClick={handleRevealToggle}
          className="ml-1 text-muted hover:text-foreground text-xs leading-none shrink-0"
          tabIndex={-1}
        >
          {revealed ? "hide" : "reveal"}
        </button>
      )}
      {popup.visible && popup.rect && (
        <Popup
          ref={popupRef}
          text={text}
          anchorRect={popup.rect}
          pinned={popup.pinned}
          onClose={handlePopupClose}
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
          sensitive={sensitive}
          revealed={revealed}
          onRevealChange={onRevealChange}
        />
      )}
    </span>
  );
}

interface PopupProps {
  text: string;
  anchorRect: DOMRect;
  pinned: boolean;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  sensitive?: boolean;
  revealed?: boolean;
  onRevealChange?: (revealed: boolean) => void;
}

const Popup = forwardRef<HTMLDivElement, PopupProps>(function Popup(
  { text, anchorRect, pinned, onClose, onMouseEnter, onMouseLeave, sensitive, revealed, onRevealChange },
  ref
) {
  const isHidden = sensitive && !revealed;
  const displayText = isHidden ? SENSITIVE_MASK : text;
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // SSR safety - createPortal requires document.body
  if (typeof window === "undefined") return null;

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const spaceAbove = anchorRect.top;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  const popupMaxHeight = 200;
  const popupMaxWidth = Math.min(400, viewportWidth - 32);
  const gap = 8;

  const showAbove = spaceAbove >= popupMaxHeight + gap || spaceAbove > spaceBelow;

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.max(16, Math.min(anchorRect.left, viewportWidth - popupMaxWidth - 16)),
    maxWidth: popupMaxWidth,
    zIndex: 9999,
  };

  if (showAbove) {
    style.bottom = viewportHeight - anchorRect.top + gap;
  } else {
    style.top = anchorRect.bottom + gap;
  }

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      aria-live="polite"
      style={style}
      className="animate-popup-in"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-background border border-border rounded-md shadow-lg overflow-hidden">
        {(pinned || sensitive) && (
          <div className="flex justify-between items-center border-b border-border px-2 py-1">
            <div>
              {sensitive && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onRevealChange?.(!revealed);
                  }}
                  className="text-muted hover:text-foreground text-xs"
                >
                  {revealed ? "hide" : "reveal"}
                </button>
              )}
            </div>
            {pinned && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onClose();
                }}
                className="text-muted hover:text-foreground text-xs"
                aria-label="Close"
              >
                close
              </button>
            )}
          </div>
        )}
        <div
          className="p-2 overflow-auto text-sm font-mono break-all"
          style={{ maxHeight: pinned ? popupMaxHeight - 32 : popupMaxHeight }}
        >
          {displayText}
        </div>
      </div>
    </div>,
    document.body
  );
});
