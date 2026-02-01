import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

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
 * Invalidate all queries after a major update (e.g., update all projects).
 */
export function invalidateAllQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.containers.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.images.updates });
}

/**
 * Clear update cache via API and invalidate image queries.
 */
export async function clearUpdateCacheAndInvalidate(queryClient: QueryClient) {
  await fetch("/api/images/check-updates", { method: "DELETE" });
  invalidateImageQueries(queryClient);
}
