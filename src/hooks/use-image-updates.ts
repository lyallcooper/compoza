"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse } from "@/types";

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
    queryKey: ["image-updates"],
    queryFn: async (): Promise<ImageUpdateStatus[]> => {
      const res = await fetch("/api/images/check-updates");
      const data: ApiResponse<ImageUpdateStatus[]> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data || [];
    },
    staleTime: 10000, // Consider stale after 10 seconds (to pick up version resolution)
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
