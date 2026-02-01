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

function buildFullText(
  selection: Selection,
  truncatedElements: Array<{ element: Element; fullText: string }>
): string | null {
  // Get the selected text
  const selectedText = selection.toString();

  // If there's only one truncated element and it's fully selected,
  // just return its full text
  if (truncatedElements.length === 1) {
    const { element, fullText } = truncatedElements[0];
    const truncatedText = element.textContent || "";

    // Check if the truncated text appears in the selection
    if (selectedText.includes(truncatedText)) {
      return selectedText.replace(truncatedText, fullText);
    }

    // If partially selected, check if selection is entirely within this element
    const range = selection.getRangeAt(0);
    if (element.contains(range.startContainer) && element.contains(range.endContainer)) {
      // Partial selection within truncated text - return full text
      return fullText;
    }
  }

  // For multiple truncated elements, replace each occurrence
  let result = selectedText;
  for (const { element, fullText } of truncatedElements) {
    const truncatedText = element.textContent || "";
    if (truncatedText && result.includes(truncatedText)) {
      result = result.replace(truncatedText, fullText);
    }
  }

  return result !== selectedText ? result : null;
}
