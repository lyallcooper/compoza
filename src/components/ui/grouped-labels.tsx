"use client";

import { useState, useMemo } from "react";
import { SelectableText } from "./selectable-text";
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
  const groups: Map<string, LabelGroup> = new Map();

  for (const [key, value] of entries) {
    // Find prefix (everything up to and including the second-to-last dot)
    const parts = key.split(".");
    let prefix: string;
    let suffix: string;

    if (parts.length >= 3) {
      // Group by all but the last part: "com.docker.compose.project" -> prefix="com.docker.compose", suffix="project"
      prefix = parts.slice(0, -1).join(".");
      suffix = parts[parts.length - 1];
    } else {
      // No grouping for short keys
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
    // Start with all groups collapsed except small ones
    const initial = new Set<string>();
    for (const group of groups) {
      if (group.prefix && group.labels.length > 1) {
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
    <div className="text-sm font-mono space-y-1 max-h-64 overflow-auto">
      {groups.map((group) => {
        if (!group.prefix) {
          // Ungrouped labels - render directly
          return group.labels.map(({ fullKey, value }) => (
            <div key={fullKey}>
              <SelectableText className="text-muted">{fullKey}</SelectableText>
              <span className="text-muted">:</span>{" "}
              <SelectableText>
                <TruncatedText text={value} maxLength={60} />
              </SelectableText>
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
                    <SelectableText className="text-muted">.{suffix}</SelectableText>
                    <span className="text-muted">:</span>{" "}
                    <SelectableText>
                      <TruncatedText text={value} maxLength={50} />
                    </SelectableText>
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
