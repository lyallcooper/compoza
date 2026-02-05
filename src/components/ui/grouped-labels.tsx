"use client";

import { useState, useMemo } from "react";
import { TruncatedText } from "./truncated-text";
import { isSensitiveKey } from "@/lib/format";

interface GroupedLabelsProps {
  labels: Record<string, string>;
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

export function GroupedLabels({ labels }: GroupedLabelsProps) {
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

  const renderNode = (node: LabelNode, depth: number, isFirst: boolean) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.key);
    const showBorder = depth > 0 || !isFirst;

    return (
      <div key={node.key} className="break-inside-avoid">
        {/* Node row */}
        <div
          className={`
            flex items-center px-2 py-1.5 text-xs overflow-hidden
            ${showBorder ? "border-t border-border" : ""}
            ${hasChildren ? "cursor-pointer hover:bg-surface" : ""}
          `}
          onClick={hasChildren ? () => toggleCollapse(node.key) : undefined}
        >
          {/* Expand/collapse toggle - 2ch wide, arrow left-aligned with trailing space */}
          <span className="inline-block shrink-0 text-muted" style={{ width: '2ch' }}>
            {hasChildren ? (isCollapsed ? "▸" : "▾") : ""}
          </span>

          {/* Key */}
          <span className="font-mono text-muted shrink-0">
            {depth > 0 ? `.${node.suffix}` : node.suffix}
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
          <div className="border-l border-border" style={{ marginLeft: 12 }}>
            {node.children.map((child, index) => renderNode(child, depth + 1, index === 0))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {tree.map((node, index) => renderNode(node, 0, index === 0))}
    </div>
  );
}
