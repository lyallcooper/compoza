"use client";

import { useEffect } from "react";
import { Box, Button } from "@/components/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div>
      <Box title="Error">
        <div className="space-y-4">
          <p className="text-error">Something went wrong!</p>
          <p className="text-sm text-muted">{error.message}</p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </Box>
    </div>
  );
}
