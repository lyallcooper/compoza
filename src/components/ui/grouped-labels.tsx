"use client";

import { useState, useMemo } from "react";
import { Box } from "./box";
import { Button } from "./button";
import { TruncatedText } from "./truncated-text";
import { ResponsiveTable } from "./responsive-table";
import type { ColumnDef } from "./responsive-table";
import { isSensitiveKey } from "@/lib/format";

interface GroupedLabelsProps {
  labels: Record<string, string>;
  title?: string;
}

interface LabelNode {
  key: string;           // Full key (e.g., "com.docker.compose")
  suffix: string;        // Display suffix (e.g., "compose")
  value?: string;        // Value if this key exists as a label
  children: LabelNode[]; // Nested children
}

function buildLabelTree(labels: Record<string, string>): LabelNode[] {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));

  // Build a map of all nodes by their full key
  const nodeMap = new Map<string, LabelNode>();
  const roots: LabelNode[] = [];

  for (const [key, value] of entries) {
    const parts = key.split(".");

    // Ensure all ancestor nodes exist
    for (let i = 0; i < parts.length; i++) {
      const partialKey = parts.slice(0, i + 1).join(".");

      if (!nodeMap.has(partialKey)) {
        const node: LabelNode = {
          key: partialKey,
          suffix: parts[i],
          children: [],
        };
        nodeMap.set(partialKey, node);

        if (i === 0) {
          // Root level node
          roots.push(node);
        } else {
          // Add to parent's children
          const parentKey = parts.slice(0, i).join(".");
          const parent = nodeMap.get(parentKey);
          if (parent) {
            parent.children.push(node);
          }
        }
      }
    }

    // Set the value on the actual key's node
    const node = nodeMap.get(key);
    if (node) {
      node.value = value;
    }
  }

  return roots;
}

// Infrastructure labels that should be collapsed by default and sorted to end
function isInfrastructureLabel(key: string): boolean {
  return key.startsWith("com.docker") || key.startsWith("org.opencontainers");
}

// Flatten nodes that only have one child and no value (compress paths)
const GUIDE_LEFT = 8;
const INDENT_PX = 24;
const HORIZ_ARM = INDENT_PX / 2 - 2;

function compressTree(nodes: LabelNode[]): LabelNode[] {
  return nodes.map((node) => {
    // First compress children recursively
    const compressedChildren = compressTree(node.children);

    // If this node has no value and exactly one child, merge with child
    if (node.value === undefined && compressedChildren.length === 1) {
      const child = compressedChildren[0];
      return {
        ...child,
        key: child.key,
        suffix: `${node.suffix}.${child.suffix}`,
        children: child.children,
      };
    }

    return {
      ...node,
      children: compressedChildren,
    };
  });
}

export function GroupedLabels({ labels, title = "Labels" }: GroupedLabelsProps) {
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");

  const tree = useMemo(() => {
    const rawTree = buildLabelTree(labels);
    const compressed = compressTree(rawTree);
    // Sort infrastructure labels to the end
    return compressed.sort((a, b) => {
      const aInfra = isInfrastructureLabel(a.key);
      const bInfra = isInfrastructureLabel(b.key);
      if (aInfra && !bInfra) return 1;
      if (!aInfra && bInfra) return -1;
      return a.key.localeCompare(b.key);
    });
  }, [labels]);

  const sortedEntries = useMemo(
    () => Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)),
    [labels]
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // Collapse common infrastructure label groups by default
    const initial = new Set<string>();
    const addCollapsed = (nodes: LabelNode[]) => {
      for (const node of nodes) {
        if (isInfrastructureLabel(node.key)) {
          initial.add(node.key);
        }
        addCollapsed(node.children);
      }
    };
    addCollapsed(tree);
    return initial;
  });

  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleRevealChange = (key: string, revealed: boolean) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (revealed) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const renderNode = (node: LabelNode, isLast: boolean, ancestorIsLast: boolean[]) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.key);
    const depth = ancestorIsLast.length;

    return (
      <div key={node.key}>
        {/* Node row */}
        <div
          className={`
            relative flex items-baseline pr-2 py-0.5 text-xs overflow-hidden
            ${hasChildren ? "cursor-pointer hover:bg-surface" : ""}
          `}
          style={{ paddingLeft: GUIDE_LEFT + (depth + 1) * INDENT_PX }}
          onClick={hasChildren ? () => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) return;
            toggleCollapse(node.key);
          } : undefined}
        >
          {/* Ancestor vertical continuation lines */}
          {ancestorIsLast.map((wasLast, i) =>
            !wasLast ? (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l-[1.5px] border-muted"
                style={{ left: GUIDE_LEFT + i * INDENT_PX + INDENT_PX / 2 }}
              />
            ) : null
          )}

          {/* Current node connector: vertical */}
          <div
            className="absolute border-l-[1.5px] border-muted"
            style={{
              left: GUIDE_LEFT + depth * INDENT_PX + INDENT_PX / 2,
              top: 0,
              height: isLast ? "50%" : "100%",
            }}
          />
          {/* Current node connector: horizontal */}
          <div
            className="absolute border-t-[1.5px] border-muted"
            style={{
              left: GUIDE_LEFT + depth * INDENT_PX + INDENT_PX / 2,
              top: "50%",
              width: HORIZ_ARM,
            }}
          />

          {/* Key + collapse indicator */}
          <span className="relative font-mono text-muted shrink-0">
            {node.suffix}
            {hasChildren && (
              <span className="absolute text-muted select-none ml-1">
                {isCollapsed ? "▸" : "▾"}
              </span>
            )}
          </span>

          {/* Value */}
          {node.value !== undefined && (
            <span
              className="font-mono flex-1 min-w-0 ml-4"
              data-truncate-container="true"
            >
              <TruncatedText
                text={node.value}
                maxLength={50}
                sensitive={isSensitiveKey(node.key)}
                revealed={revealedKeys.has(node.key)}
                onRevealChange={(revealed) => handleRevealChange(node.key, revealed)}
              />
            </span>
          )}
        </div>

        {/* Children */}
        {hasChildren && !isCollapsed && (
          <div>
            {node.children.map((child, index) =>
              renderNode(child, index === node.children.length - 1, [...ancestorIsLast, isLast])
            )}
          </div>
        )}
      </div>
    );
  };

  const tableColumns: ColumnDef<[string, string]>[] = [
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
              onRevealChange={(revealed) => handleRevealChange(key, revealed)}
            />
          </span>
        );
      },
    },
  ];

  const toggleButton = (
    <Button
      variant="default"
      onClick={() => setViewMode(viewMode === "tree" ? "table" : "tree")}
    >
      Toggle view
    </Button>
  );

  return (
    <Box title={title} padding={false} collapsible actions={toggleButton}>
      {viewMode === "tree" ? (
        <div>
          {tree.map((node, index) =>
            renderNode(node, index === tree.length - 1, [])
          )}
        </div>
      ) : (
        <ResponsiveTable
          data={sortedEntries}
          columns={tableColumns}
          keyExtractor={([key]) => key}
        />
      )}
    </Box>
  );
}
