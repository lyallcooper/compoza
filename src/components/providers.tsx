"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { useKeyboardShortcuts, useImageUpdates } from "@/hooks";
import { TruncatedTextCopyHandler, KeyboardShortcutsModal, BackgroundTaskToast } from "@/components/ui";
import { BackgroundTasksProvider } from "@/contexts";

/**
 * Starts the image update check as soon as the app loads.
 * This ensures updates are available regardless of which page the user visits first.
 */
function BackgroundUpdateChecker() {
  useImageUpdates();
  return null;
}

function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const { showHelp, closeHelp } = useKeyboardShortcuts();

  return (
    <>
      {children}
      <KeyboardShortcutsModal open={showHelp} onClose={closeHelp} />
    </>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BackgroundTasksProvider>
        <BackgroundUpdateChecker />
        <TruncatedTextCopyHandler />
        <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>
        <BackgroundTaskToast />
      </BackgroundTasksProvider>
    </QueryClientProvider>
  );
}
