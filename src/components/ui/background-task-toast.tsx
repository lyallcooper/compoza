"use client";

import { useEffect, useRef, useState } from "react";
import { useBackgroundTasks, type BackgroundTask } from "@/contexts";
import { Button } from "./button";
import { Spinner } from "./spinner";
import { formatBytes } from "@/lib/format";

const AUTO_DISMISS_DELAY = 5000;
const MAX_VISIBLE_TASKS = 5;

function formatResultValue(key: string, value: unknown): string | null {
  if (typeof value === "number" && key.toLowerCase().includes("reclaimed")) {
    return formatBytes(value);
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return String(value.length);
  return null;
}

const resultKeyLabels: Record<string, string> = {
  containersDeleted: "Containers removed",
  imagesDeleted: "Images removed",
  networksDeleted: "Networks removed",
  volumesDeleted: "Volumes removed",
  spaceReclaimed: "Space reclaimed",
  buildCacheSpaceReclaimed: "Build cache cleared",
};

function TaskResult({ result }: { result: Record<string, unknown> }) {
  const entries = Object.entries(result).filter(([key, v]) => {
    if (!(key in resultKeyLabels)) return false;
    if (typeof v === "number") return v > 0;
    if (Array.isArray(v)) return v.length > 0;
    return v != null;
  });

  if (entries.length === 0) {
    return <div className="mt-1.5 text-xs text-muted">Nothing to remove</div>;
  }

  return (
    <div className="mt-1.5 space-y-0.5 text-xs text-muted">
      {entries.map(([key, value]) => {
        const label = resultKeyLabels[key] || key;
        const formatted = formatResultValue(key, value);
        if (!formatted) return null;
        return (
          <div key={key}>
            {label}: <span className="font-semibold text-foreground">{formatted}</span>
          </div>
        );
      })}
    </div>
  );
}

function TaskOutput({ lines }: { lines: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      className="mt-1.5 max-h-32 overflow-y-auto bg-background/50 border border-border rounded p-2 font-mono text-[0.7rem] leading-relaxed text-muted whitespace-pre-wrap break-all"
    >
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

function TaskItem({
  task,
  expanded,
  onToggleExpand,
}: {
  task: BackgroundTask;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { removeTask } = useBackgroundTasks();

  const isRunning = task.status === "running";
  const isError = task.status === "error";
  const isComplete = task.status === "complete";
  const isDisconnected = task.status === "disconnected";

  const hasOutput = (task.output?.length ?? 0) > 0;
  const hasResult = task.result != null && Object.keys(task.result).some((key) => key in resultKeyLabels);
  const isExpandable = hasOutput || hasResult;

  // Auto-dismiss completed tasks after delay (not errors, disconnected, or expanded)
  useEffect(() => {
    if (!isComplete || expanded) return;

    const timer = setTimeout(() => {
      removeTask(task.id);
    }, AUTO_DISMISS_DELAY);

    return () => clearTimeout(timer);
  }, [isComplete, expanded, task.id, removeTask]);

  const handleCancel = () => {
    task.cancel?.();
  };

  const handleDismiss = () => {
    removeTask(task.id);
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {(isRunning || isDisconnected) && <Spinner size="sm" />}
            {isComplete && <span className="text-success">✓</span>}
            {isError && <span className="text-error">✗</span>}
            <span className="font-medium truncate">{task.label}</span>
            {isExpandable && (
              <button
                onClick={onToggleExpand}
                className="text-muted hover:text-foreground p-0.5 flex-shrink-0"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
          {task.progress && (
            <div className="text-xs text-muted mt-0.5 truncate">{task.progress}</div>
          )}
          {task.error && (
            <div className="text-xs text-error mt-1 whitespace-pre-line">{task.error}</div>
          )}
        </div>
        <div className="flex-shrink-0">
          {isRunning && task.cancel && (
            <Button onClick={handleCancel}>
              Cancel
            </Button>
          )}
          {!isRunning && (
            <button
              onClick={handleDismiss}
              className="text-muted hover:text-foreground p-1"
              aria-label="Dismiss"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <>
          {hasOutput && <TaskOutput lines={task.output!} />}
          {hasResult && isComplete && <TaskResult result={task.result!} />}
        </>
      )}
    </div>
  );
}

export function BackgroundTaskToast() {
  const { tasks } = useBackgroundTasks();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const visibleTasks = tasks.filter((t) => !t.hidden);

  if (visibleTasks.length === 0) {
    return null;
  }

  const displayedTasks = visibleTasks.slice(0, MAX_VISIBLE_TASKS);
  const overflow = visibleTasks.length - MAX_VISIBLE_TASKS;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-[60] border border-border bg-surface rounded shadow-lg animate-toast-in max-h-[50vh] overflow-y-auto">
      <div className="divide-y divide-border">
        {displayedTasks.map((task) => (
          <div key={task.id} className="p-3">
            <TaskItem
              task={task}
              expanded={expandedTaskId === task.id}
              onToggleExpand={() =>
                setExpandedTaskId((prev) => (prev === task.id ? null : task.id))
              }
            />
          </div>
        ))}
        {overflow > 0 && (
          <div className="p-2 text-center text-xs text-muted">
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
}
