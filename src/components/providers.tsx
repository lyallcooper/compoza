"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { useKeyboardShortcuts, useImageUpdates } from "@/hooks";
import { TruncatedTextCopyHandler, KeyboardShortcutsModal, BackgroundTaskToast } from "@/components/ui";
import { BackgroundTasksProvider } from "@/contexts";
import { isDemoMode } from "@/lib/demo";

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

function DemoBanner() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-foreground px-4 py-2 text-center text-xs text-background">
      <div><span className="inline-block rounded bg-background px-1.5 py-0.5 font-bold text-foreground">DEMO MODE</span></div>
      <div className="mt-1">
        Using simulated data · Changes not persisted · Not all features available
      </div>
    </div>
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
        {isDemoMode() && <DemoBanner />}
      </BackgroundTasksProvider>
    </QueryClientProvider>
  );
}
