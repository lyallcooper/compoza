"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export function useKeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  const openHelp = useCallback(() => setShowHelp(true), []);
  const closeHelp = useCallback(() => setShowHelp(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs (except Escape)
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable;

      // Escape always works to close help modal
      if (e.key === "Escape" && showHelp) {
        setShowHelp(false);
        return;
      }

      // Skip other shortcuts when in input
      if (isInput) {
        return;
      }

      // ? for help
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      // Global shortcuts with 'g' prefix (like GitHub)
      if (e.key === "g") {
        const handleSecondKey = (e2: KeyboardEvent) => {
          // Prevent if user is now in an input
          if (
            e2.target instanceof HTMLInputElement ||
            e2.target instanceof HTMLTextAreaElement ||
            (e2.target as HTMLElement).isContentEditable
          ) {
            return;
          }

          switch (e2.key) {
            case "h":
            case "d":
              router.push("/");
              break;
            case "p":
              router.push("/projects");
              break;
            case "c":
              router.push("/containers");
              break;
            case "s":
              router.push("/system");
              break;
          }
          document.removeEventListener("keydown", handleSecondKey);
        };

        document.addEventListener("keydown", handleSecondKey, { once: true });

        // Clear listener after timeout
        setTimeout(() => {
          document.removeEventListener("keydown", handleSecondKey);
        }, 1000);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router, showHelp]);

  return {
    showHelp,
    openHelp,
    closeHelp,
  };
}
