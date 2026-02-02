"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { useKeyboardShortcuts } from "@/hooks";
import { TruncatedTextCopyHandler, KeyboardShortcutsModal } from "@/components/ui";

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
            refetchInterval: 10000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TruncatedTextCopyHandler />
      <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>
    </QueryClientProvider>
  );
}
