"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { isProjectRunning, type Project } from "@/types";

export interface ImageUpdateStatus {
  image: string;
  updateAvailable: boolean;
  ignored?: boolean;
  status: "checked" | "unknown" | "error";
  checkedAt: number;
  currentDigest?: string;
  latestDigest?: string;
  outdatedImageIds?: string[];
  checkedImageIds?: string[];
  currentVersion?: string;
  latestVersion?: string;
  matchedTags?: string[];
  versionStatus?: "pending" | "resolved" | "failed";
  sourceUrl?: string;
}

/** Match updates to the image a particular container actually uses. */
export function hasImageUpdate(update: ImageUpdateStatus | undefined, imageId?: string, includeIgnored = false): boolean {
  return !!update && (update.updateAvailable || (includeIgnored && !!update.ignored)) && (
    !imageId || update.status !== "checked" || !update.outdatedImageIds || !update.checkedImageIds?.includes(imageId) || update.outdatedImageIds.includes(imageId)
  );
}

export interface ProjectWithUpdates {
  name: string;
  isRunning: boolean;
  images: {
    image: string;
    currentVersion?: string;
    latestVersion?: string;
    currentDigest?: string;
    latestDigest?: string;
    sourceUrl?: string;
    ignored?: boolean;
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

export function useIgnoreImageUpdate(onIgnored?: (release: { image: string; latestDigest: string }) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (release: { image: string; latestDigest: string }) =>
      apiPost("/api/images/ignore-update", release),
    onSuccess: (_data, release) => {
      onIgnored?.(release);
      return queryClient.invalidateQueries({ queryKey: queryKeys.images.updates });
    },
  });
}

/**
 * Compute projects that have image updates available.
 * Dedupes images within each project (multiple services may use the same image).
 */
export function getProjectsWithUpdates(
  projects: Project[] | undefined,
  imageUpdates: ImageUpdateStatus[] | undefined,
  options: { includeIgnored?: boolean } = {}
): ProjectWithUpdates[] {
  if (!projects || !imageUpdates) return [];

  const updateMap = new Map(
    imageUpdates.map((u) => [u.image, u])
  );

  return projects
    .map((project) => {
      const seenImages = new Set<string>();
      const images: ProjectWithUpdates["images"] = [];

      for (const service of project.services) {
        if (!service.image || seenImages.has(service.image)) continue;
        const update = updateMap.get(service.image);
        if (!update || !hasImageUpdate(update, service.imageId, options.includeIgnored)) continue;

        seenImages.add(service.image);
        images.push({
          image: service.image,
          currentVersion: update.currentVersion,
          latestVersion: update.latestVersion,
          currentDigest: update.currentDigest,
          latestDigest: update.latestDigest,
          sourceUrl: update.sourceUrl,
          ignored: update.ignored,
        });
      }

      const isRunning = isProjectRunning(project);
      return { name: project.name, isRunning, images };
    })
    .filter((p) => p.images.length > 0);
}
