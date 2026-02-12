"use client";

import { useState, useMemo } from "react";
import { Box } from "./box";
import { TruncatedText } from "./truncated-text";
import { ResponsiveTable } from "./responsive-table";
import type { ColumnDef } from "./responsive-table";
import { isSensitiveKey } from "@/lib/format";

interface EnvironmentVariablesSectionProps {
  env: Record<string, string>;
}

export function EnvironmentVariablesSection({ env }: EnvironmentVariablesSectionProps) {
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const sortedEntries = useMemo(
    () => Object.entries(env).sort(([a], [b]) => a.localeCompare(b)),
    [env]
  );

  const columns: ColumnDef<[string, string]>[] = [
    {
      key: "key",
      header: "Key",
      shrink: true,
      cardPosition: "header",
      render: ([key]) => (
        <span className="font-mono text-xs font-medium">
          <TruncatedText text={key} showPopup={false} />
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      cardPosition: "body",
      cardLabel: false,
      render: ([key, value]) => {
        const isSensitive = isSensitiveKey(key);
        const isRevealed = revealedKeys.has(key);

        return (
          <span className="font-mono text-xs">
            <TruncatedText
              text={value}
              maxLength={50}
              sensitive={isSensitive}
              revealed={isRevealed}
              onRevealChange={(revealed) => {
                setRevealedKeys((prev) => {
                  const next = new Set(prev);
                  if (revealed) {
                    next.add(key);
                  } else {
                    next.delete(key);
                  }
                  return next;
                });
              }}
            />
          </span>
        );
      },
    },
  ];

  return (
    <Box title="Environment Variables" padding={false} className="break-inside-avoid" collapsible>
      <ResponsiveTable
        data={sortedEntries}
        columns={columns}
        keyExtractor={([key]) => key}
      />
    </Box>
  );
}
