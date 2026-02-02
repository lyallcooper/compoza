"use client";

import { useRef, useState, useLayoutEffect } from "react";

interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  className?: string;
}

export function TruncatedText({ text, maxLength, className }: TruncatedTextProps) {
  // Fixed truncation mode (original behavior)
  if (maxLength !== undefined) {
    if (text.length <= maxLength) {
      return <span className={className} title={text}>{text}</span>;
    }
    const keepChars = Math.floor((maxLength - 3) / 2);
    const truncated = `${text.slice(0, keepChars)}...${text.slice(-keepChars)}`;
    return (
      <span
        className={className}
        title={text}
        data-full-text={text}
        data-keep-chars={keepChars}
      >
        {truncated}
      </span>
    );
  }

  // Responsive truncation mode
  return <ResponsiveTruncatedText text={text} className={className} />;
}

function ResponsiveTruncatedText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(text);
  const [keepChars, setKeepChars] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create a hidden measurement span
    const measureSpan = document.createElement("span");
    measureSpan.style.visibility = "hidden";
    measureSpan.style.position = "absolute";
    measureSpan.style.whiteSpace = "nowrap";
    // Copy font styles
    const styles = window.getComputedStyle(container);
    measureSpan.style.font = styles.font;
    measureSpan.style.fontSize = styles.fontSize;
    measureSpan.style.fontFamily = styles.fontFamily;
    document.body.appendChild(measureSpan);

    const calculateTruncation = () => {
      const availableWidth = container.clientWidth;

      // Check if full text fits
      measureSpan.textContent = text;
      if (measureSpan.offsetWidth <= availableWidth) {
        setTruncated(text);
        setKeepChars(null);
        return;
      }

      // Binary search for optimal truncation length
      let low = 1;
      let high = Math.floor(text.length / 2);
      let bestKeep = 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testStr = `${text.slice(0, mid)}...${text.slice(-mid)}`;
        measureSpan.textContent = testStr;

        if (measureSpan.offsetWidth <= availableWidth) {
          bestKeep = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      setKeepChars(bestKeep);
      setTruncated(`${text.slice(0, bestKeep)}...${text.slice(-bestKeep)}`);
    };

    calculateTruncation();

    const resizeObserver = new ResizeObserver(calculateTruncation);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      document.body.removeChild(measureSpan);
    };
  }, [text]);

  const baseClass = "block whitespace-nowrap overflow-hidden flex-1 min-w-0 text-right";
  const classes = className ? `${baseClass} ${className}` : baseClass;

  return (
    <span
      ref={containerRef}
      className={classes}
      title={text}
      data-full-text={keepChars !== null ? text : undefined}
      data-keep-chars={keepChars ?? undefined}
    >
      {truncated}
    </span>
  );
}
