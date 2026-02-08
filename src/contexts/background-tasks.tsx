"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  ReactNode,
} from "react";

const MAX_OUTPUT_LINES = 200;

export interface BackgroundTask {
  id: string;
  type: string;
  label: string;
  progress?: string;
  total?: number;
  current?: number;
  status: "running" | "complete" | "error" | "disconnected";
  error?: string;
  cancel?: () => void;
  output?: string[];
  result?: Record<string, unknown>;
  hidden?: boolean;
}

interface BackgroundTasksContextValue {
  tasks: BackgroundTask[];
  addTask: (task: BackgroundTask) => void;
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void;
  removeTask: (id: string) => void;
  appendOutput: (id: string, lines: string[]) => void;
}

const BackgroundTasksContext = createContext<BackgroundTasksContextValue | null>(null);

export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  const addTask = useCallback((task: BackgroundTask) => {
    setTasks((prev) => [...prev, task]);
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<BackgroundTask>) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, ...updates } : task))
    );
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const appendOutput = useCallback((id: string, lines: string[]) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const existing = task.output || [];
        const combined = [...existing, ...lines];
        return {
          ...task,
          output: combined.length > MAX_OUTPUT_LINES
            ? combined.slice(combined.length - MAX_OUTPUT_LINES)
            : combined,
        };
      })
    );
  }, []);

  return (
    <BackgroundTasksContext.Provider
      value={{ tasks, addTask, updateTask, removeTask, appendOutput }}
    >
      {children}
    </BackgroundTasksContext.Provider>
  );
}

export function useBackgroundTasks() {
  const context = useContext(BackgroundTasksContext);
  if (!context) {
    throw new Error(
      "useBackgroundTasks must be used within a BackgroundTasksProvider"
    );
  }
  return context;
}
