"use client";

import { useEffect } from "react";
import { useBackgroundTasks, type BackgroundTask } from "@/contexts";
import { Button } from "./button";
import { Spinner } from "./spinner";

const AUTO_DISMISS_DELAY = 5000;

function TaskItem({ task }: { task: BackgroundTask }) {
  const { removeTask } = useBackgroundTasks();

  const isRunning = task.status === "running";
  const isError = task.status === "error";
  const isComplete = task.status === "complete";

  // Auto-dismiss completed tasks after delay (but not errors)
  useEffect(() => {
    if (!isComplete) return;

    const timer = setTimeout(() => {
      removeTask(task.id);
    }, AUTO_DISMISS_DELAY);

    return () => clearTimeout(timer);
  }, [isComplete, task.id, removeTask]);

  const handleCancel = () => {
    task.cancel?.();
  };

  const handleDismiss = () => {
    removeTask(task.id);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isRunning && <Spinner size="sm" />}
          {isComplete && <span className="text-success">✓</span>}
          {isError && <span className="text-error">✗</span>}
          <span className="font-medium truncate">{task.label}</span>
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
          <Button size="sm" onClick={handleCancel}>
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
  );
}

export function BackgroundTaskToast() {
  const { tasks } = useBackgroundTasks();

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-[60] border border-border bg-surface rounded shadow-lg animate-toast-in">
      <div className="divide-y divide-border">
        {tasks.map((task) => (
          <div key={task.id} className="p-3">
            <TaskItem task={task} />
          </div>
        ))}
      </div>
    </div>
  );
}
