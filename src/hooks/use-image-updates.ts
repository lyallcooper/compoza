"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query";

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
}

export function useImageUpdates() {
  return useQuery({
    queryKey: queryKeys.images.updates,
    queryFn: () => apiFetch<ImageUpdateStatus[]>("/api/images/check-updates"),
    staleTime: 10000, // Consider stale after 10 seconds (to pick up version resolution)
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
