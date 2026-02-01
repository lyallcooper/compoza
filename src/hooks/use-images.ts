"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DockerImage, ApiResponse } from "@/types";

export function useImages() {
  return useQuery({
    queryKey: ["images"],
    queryFn: async (): Promise<DockerImage[]> => {
      const res = await fetch("/api/images");
      const data: ApiResponse<DockerImage[]> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data || [];
    },
  });
}

export function usePullImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/images/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data: ApiResponse<{ message: string }> = await res.json();
      if (data.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: async (_data, name) => {
      // Clear update cache for this image so it gets rechecked
      await fetch("/api/images/check-updates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [name] }),
      });
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["image-updates"] });
    },
  });
}
