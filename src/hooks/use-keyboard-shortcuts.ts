"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Global shortcuts with 'g' prefix (like GitHub)
      if (e.key === "g") {
        const handleSecondKey = (e2: KeyboardEvent) => {
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
              router.push("/settings");
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

      // ? for help
      if (e.key === "?") {
        // Could show a keyboard shortcuts modal
        console.log("Keyboard shortcuts:");
        console.log("g h / g d - Go to dashboard");
        console.log("g p - Go to projects");
        console.log("g c - Go to containers");
        console.log("g s - Go to settings");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);
}
