"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse } from "@/types";

interface ImageUpdateStatus {
  image: string;
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  checkedAt: number;
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
    staleTime: 30000, // Consider stale after 30 seconds
    refetchInterval: 60000, // Refetch every minute to pick up background updates
  });
}
