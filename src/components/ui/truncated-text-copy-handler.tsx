"use client";

import { useEffect } from "react";

/**
 * Global copy handler that ensures full text is copied when TruncatedText
 * elements are in the selection. Add this component once at the app root.
 */
export function TruncatedTextCopyHandler() {
  useEffect(() => {
    function handleCopy(e: ClipboardEvent) {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      // Check if any truncated text elements are in the selection
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // Get the element to search within
      const searchRoot = container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container as Element;

      if (!searchRoot) return;

      // Find all truncated text elements in or containing the selection
      const truncatedElements = findTruncatedElementsInSelection(selection, searchRoot);

      if (truncatedElements.length === 0) return;

      // Build the modified text by replacing truncated text with full text
      const modifiedText = buildFullText(selection, truncatedElements);

      if (modifiedText !== null) {
        e.preventDefault();
        e.clipboardData?.setData("text/plain", modifiedText);
      }
    }

    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, []);

  return null;
}

function findTruncatedElementsInSelection(
  selection: Selection,
  searchRoot: Element
): Array<{ element: Element; fullText: string }> {
  const results: Array<{ element: Element; fullText: string }> = [];

  // Find all elements with data-full-text attribute
  const candidates = searchRoot.querySelectorAll("[data-full-text]");

  // Also check if searchRoot itself has the attribute
  const allCandidates = searchRoot.hasAttribute?.("data-full-text")
    ? [searchRoot, ...Array.from(candidates)]
    : Array.from(candidates);

  for (const element of allCandidates) {
    if (selection.containsNode(element, true)) {
      const fullText = element.getAttribute("data-full-text");
      if (fullText) {
        results.push({ element, fullText });
      }
    }
  }

  return results;
}

/**
 * Maps a partial selection within truncated text to the corresponding full text.
 *
 * For truncated text "abc...xyz" representing "abcHIDDENxyz":
 * - Selecting "abc" → "abc"
 * - Selecting "abc..." → "abcHIDDEN"
 * - Selecting "...xyz" → "HIDDENxyz"
 * - Selecting "xyz" → "xyz"
 * - Selecting "abc...xyz" → "abcHIDDENxyz"
 */
function mapPartialSelection(
  selStart: number,
  selEnd: number,
  keepChars: number,
  fullText: string
): string {
  const fullLength = fullText.length;
  const hiddenStart = keepChars;
  const hiddenEnd = fullLength - keepChars;
  const dotsStart = keepChars;
  const dotsEnd = keepChars + 3;

  let result = "";

  // Prefix region: truncated [0, keepChars) → full [0, keepChars)
  if (selStart < keepChars) {
    const prefixSelEnd = Math.min(selEnd, keepChars);
    result += fullText.slice(selStart, prefixSelEnd);
  }

  // Hidden region: truncated [keepChars, keepChars+3) → full [keepChars, fullLength-keepChars)
  // If selection includes any part of "...", include the entire hidden middle
  if (selStart < dotsEnd && selEnd > dotsStart) {
    result += fullText.slice(hiddenStart, hiddenEnd);
  }

  // Suffix region: truncated [keepChars+3, truncatedLength) → full [fullLength-keepChars, fullLength)
  if (selEnd > dotsEnd) {
    const suffixSelStart = Math.max(selStart, dotsEnd) - dotsEnd;
    const suffixSelEnd = selEnd - dotsEnd;
    result += fullText.slice(fullLength - keepChars + suffixSelStart, fullLength - keepChars + suffixSelEnd);
  }

  return result;
}

function getSelectionOffsetWithin(element: Element, range: Range): { start: number; end: number } | null {
  // Create a range that spans from the start of the element to the selection start
  const preRange = document.createRange();
  preRange.setStart(element, 0);

  // Handle case where selection starts before this element
  if (element.contains(range.startContainer)) {
    preRange.setEnd(range.startContainer, range.startOffset);
  } else {
    preRange.setEnd(element, 0);
  }

  const start = preRange.toString().length;

  // Calculate end position
  const fullRange = document.createRange();
  fullRange.setStart(element, 0);

  if (element.contains(range.endContainer)) {
    fullRange.setEnd(range.endContainer, range.endOffset);
  } else {
    fullRange.selectNodeContents(element);
  }

  const end = fullRange.toString().length;

  return { start, end };
}

function buildFullText(
  selection: Selection,
  truncatedElements: Array<{ element: Element; fullText: string }>
): string | null {
  const selectedText = selection.toString();
  const range = selection.getRangeAt(0);

  // Handle single truncated element with smart partial selection
  if (truncatedElements.length === 1) {
    const { element, fullText } = truncatedElements[0];
    const truncatedText = element.textContent || "";
    const keepCharsAttr = element.getAttribute("data-keep-chars");
    const keepChars = keepCharsAttr ? parseInt(keepCharsAttr, 10) : null;

    // If full truncated text is selected, replace with full text
    if (selectedText.includes(truncatedText)) {
      return selectedText.replace(truncatedText, fullText);
    }

    // Check if selection is within this element and we have keepChars info
    if (element.contains(range.startContainer) && element.contains(range.endContainer) && keepChars !== null) {
      const offsets = getSelectionOffsetWithin(element, range);
      if (offsets) {
        const mappedText = mapPartialSelection(offsets.start, offsets.end, keepChars, fullText);

        // Only return if the mapping produced different text
        const selectedWithin = truncatedText.slice(offsets.start, offsets.end);
        if (mappedText !== selectedWithin) {
          return mappedText;
        }
      }
    }
  }

  // For multiple truncated elements, replace each full occurrence
  let result = selectedText;
  for (const { element, fullText } of truncatedElements) {
    const truncatedText = element.textContent || "";
    if (truncatedText && result.includes(truncatedText)) {
      result = result.replace(truncatedText, fullText);
    }
  }

  return result !== selectedText ? result : null;
}
