/**
 * Centralized query key definitions for React Query.
 * Using constants prevents typos and enables refactoring.
 */

export const queryKeys = {
  // Containers
  containers: {
    all: ["containers"] as const,
    detail: (id: string) => ["containers", id] as const,
    stats: (id: string) => ["containers", id, "stats"] as const,
  },

  // Projects
  projects: {
    all: ["projects"] as const,
    detail: (name: string) => ["projects", name] as const,
    compose: (name: string) => ["projects", name, "compose"] as const,
    env: (name: string) => ["projects", name, "env"] as const,
  },

  // Images
  images: {
    all: ["images"] as const,
    updates: ["image-updates"] as const,
  },
} as const;
