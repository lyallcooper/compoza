"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";
import { queryKeys, invalidateImageQueries } from "@/lib/query";
import type { DockerImage } from "@/types";

export function useImages() {
  return useQuery({
    queryKey: queryKeys.images.all,
    queryFn: () => apiFetch<DockerImage[]>("/api/images"),
  });
}

export function usePullImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      apiPost<{ message: string }>("/api/images/pull", { name }),
    onSuccess: async (_data, name) => {
      // Clear update cache for this image so it gets rechecked
      await apiDelete("/api/images/check-updates", { images: [name] });
      invalidateImageQueries(queryClient);
    },
  });
}
