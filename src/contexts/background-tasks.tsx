"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  ReactNode,
} from "react";

export interface BackgroundTask {
  id: string;
  type: "update-all" | "update-project" | "update-container";
  label: string;
  progress?: string;
  total?: number;
  current?: number;
  status: "running" | "complete" | "error" | "disconnected";
  error?: string;
  cancel?: () => void;
}

interface BackgroundTasksContextValue {
  tasks: BackgroundTask[];
  addTask: (task: BackgroundTask) => void;
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void;
  removeTask: (id: string) => void;
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

  return (
    <BackgroundTasksContext.Provider
      value={{ tasks, addTask, updateTask, removeTask }}
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
