import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { isDemoMode } from "@/lib/demo";
import { demoFetchRaw } from "@/lib/demo/router";

/**
 * Invalidate container-related queries after a container action.
 */
export function invalidateContainerQueries(
  queryClient: QueryClient,
  containerId?: string
) {
  if (containerId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.containers.detail(containerId) });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.containers.all, exact: true });
  // Projects need refresh since container status affects project status
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
}

/**
 * Invalidate project-related queries after a project action.
 */
export function invalidateProjectQueries(
  queryClient: QueryClient,
  projectName?: string
) {
  if (projectName) {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectName) });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.all, exact: true });
  // Containers change when project status changes
  queryClient.invalidateQueries({ queryKey: queryKeys.containers.all });
}

/**
 * Invalidate image-related queries after pulling images.
 */
export function invalidateImageQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.images.updates });
}

/**
 * Invalidate network-related queries after a network action.
 */
export function invalidateNetworkQueries(
  queryClient: QueryClient,
  networkId?: string
) {
  if (networkId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.networks.detail(networkId) });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.networks.all, exact: true });
}

/**
 * Invalidate volume-related queries after a volume action.
 */
export function invalidateVolumeQueries(
  queryClient: QueryClient,
  volumeName?: string
) {
  if (volumeName) {
    queryClient.invalidateQueries({ queryKey: queryKeys.volumes.detail(volumeName) });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.volumes.all, exact: true });
}

/**
 * Invalidate system-related queries after a system action.
 */
export function invalidateSystemQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.system.info });
  queryClient.invalidateQueries({ queryKey: queryKeys.system.diskUsage });
}

/**
 * Invalidate all queries after a major update (e.g., update all projects).
 * Optimistically clears the updates cache to remove stale badges immediately.
 */
export function invalidateAllQueries(queryClient: QueryClient) {
  // Clear updates cache optimistically so badges disappear immediately
  queryClient.setQueryData(queryKeys.images.updates, []);

  queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.containers.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.images.updates });
  queryClient.invalidateQueries({ queryKey: queryKeys.networks.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.volumes.all });
  invalidateSystemQueries(queryClient);
}

interface ImageUpdateStatus {
  image: string;
  updateAvailable: boolean;
  status: string;
}

/**
 * Clear update cache via API and invalidate image queries.
 * If images are provided, optimistically removes them from the cache immediately
 * so badges disappear without waiting for the server refresh.
 */
export async function clearUpdateCacheAndInvalidate(
  queryClient: QueryClient,
  images?: string[]
) {
  // Optimistically update React Query cache to remove the updated images
  // This makes badges disappear immediately instead of lingering during refetch
  if (images && images.length > 0) {
    const imageSet = new Set(images);
    queryClient.setQueryData<ImageUpdateStatus[]>(
      queryKeys.images.updates,
      (old) => old?.filter((u) => !imageSet.has(u.image)) ?? []
    );
  } else {
    // Clear all - reset to empty array
    queryClient.setQueryData(queryKeys.images.updates, []);
  }

  // Clear server-side cache (best-effort — may fail during restart)
  try {
    const fetchFn = isDemoMode() ? demoFetchRaw : fetch;
    await fetchFn("/api/images/check-updates", {
      method: "DELETE",
      headers: images ? { "Content-Type": "application/json" } : undefined,
      body: images ? JSON.stringify({ images }) : undefined,
    });
  } catch {
    // Ignore — cache will be stale but queries will refresh on reconnection
  }

  // Trigger background refresh
  invalidateImageQueries(queryClient);
}
