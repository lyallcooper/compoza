"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { isProjectRunning, type Project } from "@/types";

export interface ImageUpdateStatus {
  image: string;
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  checkedAt: number;
  currentDigest?: string;
  latestDigest?: string;
  currentVersion?: string;
  latestVersion?: string;
  versionStatus?: "pending" | "resolved" | "failed";
  sourceUrl?: string;
}

export interface ProjectWithUpdates {
  name: string;
  isRunning: boolean;
  images: {
    image: string;
    currentVersion?: string;
    latestVersion?: string;
    sourceUrl?: string;
  }[];
}

export function useImageUpdates() {
  return useQuery({
    queryKey: queryKeys.images.updates,
    queryFn: () => apiFetch<ImageUpdateStatus[]>("/api/images/check-updates"),
    staleTime: 10000, // Consider stale after 10 seconds (to pick up version resolution)
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Compute projects that have image updates available.
 * Dedupes images within each project (multiple services may use the same image).
 */
export function getProjectsWithUpdates(
  projects: Project[] | undefined,
  imageUpdates: ImageUpdateStatus[] | undefined
): ProjectWithUpdates[] {
  if (!projects || !imageUpdates) return [];

  const updateMap = new Map(
    imageUpdates.filter((u) => u.updateAvailable).map((u) => [u.image, u])
  );

  return projects
    .map((project) => {
      const seenImages = new Set<string>();
      const images: ProjectWithUpdates["images"] = [];

      for (const service of project.services) {
        if (service.image && updateMap.has(service.image) && !seenImages.has(service.image)) {
          seenImages.add(service.image);
          const update = updateMap.get(service.image)!;
          images.push({
            image: service.image,
            currentVersion: update.currentVersion,
            latestVersion: update.latestVersion,
            sourceUrl: update.sourceUrl,
          });
        }
      }

      const isRunning = isProjectRunning(project);
      return { name: project.name, isRunning, images };
    })
    .filter((p) => p.images.length > 0);
}
