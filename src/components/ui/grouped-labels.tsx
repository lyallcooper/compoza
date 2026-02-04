"use client";

import { useState, useMemo } from "react";
import { TruncatedText } from "./truncated-text";

interface GroupedLabelsProps {
  labels: Record<string, string>;
}

interface LabelGroup {
  prefix: string;
  labels: Array<{ suffix: string; fullKey: string; value: string }>;
}

function groupLabels(labels: Record<string, string>): LabelGroup[] {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  const prefixCounts: Map<string, number> = new Map();

  // First pass: count labels per prefix
  for (const [key] of entries) {
    const parts = key.split(".");
    if (parts.length >= 3) {
      const prefix = parts.slice(0, -1).join(".");
      prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
    }
  }

  // Second pass: group labels, only grouping if prefix has more than 1 item
  const groups: Map<string, LabelGroup> = new Map();

  for (const [key, value] of entries) {
    const parts = key.split(".");
    let prefix: string;
    let suffix: string;

    if (parts.length >= 3) {
      const candidatePrefix = parts.slice(0, -1).join(".");
      // Only group if there are multiple labels with this prefix
      if ((prefixCounts.get(candidatePrefix) || 0) > 1) {
        prefix = candidatePrefix;
        suffix = parts[parts.length - 1];
      } else {
        prefix = "";
        suffix = key;
      }
    } else {
      prefix = "";
      suffix = key;
    }

    if (!groups.has(prefix)) {
      groups.set(prefix, { prefix, labels: [] });
    }
    groups.get(prefix)!.labels.push({ suffix, fullKey: key, value });
  }

  // Convert to array and sort: grouped labels first, then ungrouped
  const result = Array.from(groups.values());
  result.sort((a, b) => {
    // Empty prefix (ungrouped) goes last
    if (a.prefix === "" && b.prefix !== "") return 1;
    if (a.prefix !== "" && b.prefix === "") return -1;
    // Sort by prefix
    return a.prefix.localeCompare(b.prefix);
  });

  return result;
}

export function GroupedLabels({ labels }: GroupedLabelsProps) {
  const groups = useMemo(() => groupLabels(labels), [labels]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // Collapse common infrastructure label groups by default
    const initial = new Set<string>();
    for (const group of groups) {
      if (group.prefix && (group.prefix.startsWith("com.docker") || group.prefix.startsWith("org.opencontainers"))) {
        initial.add(group.prefix);
      }
    }
    return initial;
  });

  const toggleGroup = (prefix: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
      }
      return next;
    });
  };

  return (
    <div className="text-sm font-mono space-y-1">
      {groups.map((group) => {
        if (!group.prefix) {
          // Ungrouped labels - render directly
          return group.labels.map(({ fullKey, value }) => (
            <div key={fullKey}>
              <TruncatedText text={fullKey} showPopup={false} className="text-muted" />
              <span className="text-muted">:</span>{" "}
              <TruncatedText text={value} maxLength={60} />
            </div>
          ));
        }

        const isCollapsed = collapsed.has(group.prefix);

        return (
          <div key={group.prefix}>
            <button
              onClick={() => toggleGroup(group.prefix)}
              className="flex items-center gap-1 text-muted hover:text-foreground w-full text-left"
            >
              <span className="w-4 text-center">{isCollapsed ? "▸" : "▾"}</span>
              <span>{group.prefix}</span>
              <span className="text-xs">({group.labels.length})</span>
            </button>
            {!isCollapsed && (
              <div className="ml-5 border-l border-border pl-2 space-y-1">
                {group.labels.map(({ suffix, fullKey, value }) => (
                  <div key={fullKey}>
                    <TruncatedText text={`.${suffix}`} showPopup={false} className="text-muted" />
                    <span className="text-muted">:</span>{" "}
                    <TruncatedText text={value} maxLength={50} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
