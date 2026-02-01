export interface CachedUpdate {
  image: string;
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  checkedAt: number;
  // Digest information
  currentDigest?: string;
  latestDigest?: string;
  // Resolved version information
  currentVersion?: string;
  latestVersion?: string;
  versionStatus?: "pending" | "resolved" | "failed";
}

// In-memory cache with TTL
const cache = new Map<string, CachedUpdate>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes between checks for same image
const pendingChecks = new Set<string>();

export function getCachedUpdate(image: string): CachedUpdate | null {
  const cached = cache.get(image);
  if (!cached) return null;

  // Return cached value if not expired
  if (Date.now() - cached.checkedAt < CACHE_TTL) {
    return cached;
  }

  return null;
}

export function setCachedUpdate(image: string, update: Omit<CachedUpdate, "checkedAt">): void {
  cache.set(image, {
    ...update,
    checkedAt: Date.now(),
  });
}

/**
 * Update only the version fields of a cached entry.
 * Used when async version resolution completes.
 */
export function updateCachedVersions(
  image: string,
  currentVersion?: string,
  latestVersion?: string
): void {
  const cached = cache.get(image);
  if (cached) {
    cached.currentVersion = currentVersion;
    cached.latestVersion = latestVersion;
    cached.versionStatus = "resolved";
  }
}

/**
 * Mark version resolution as failed for a cached entry.
 */
export function markVersionResolutionFailed(image: string): void {
  const cached = cache.get(image);
  if (cached) {
    cached.versionStatus = "failed";
  }
}

export function shouldCheckImage(image: string): boolean {
  // Don't check if already pending
  if (pendingChecks.has(image)) return false;

  const cached = cache.get(image);
  if (!cached) return true;

  // Re-check if older than CHECK_INTERVAL
  return Date.now() - cached.checkedAt > CHECK_INTERVAL;
}

export function markCheckPending(image: string): void {
  pendingChecks.add(image);
}

export function markCheckComplete(image: string): void {
  pendingChecks.delete(image);
}

export function getAllCachedUpdates(): CachedUpdate[] {
  const now = Date.now();
  const results: CachedUpdate[] = [];

  for (const [, cached] of cache) {
    if (now - cached.checkedAt < CACHE_TTL) {
      results.push(cached);
    }
  }

  return results;
}

export function getCacheStats(): { size: number; pendingChecks: number } {
  return {
    size: cache.size,
    pendingChecks: pendingChecks.size,
  };
}

export function clearCachedUpdates(images?: string[]): void {
  if (images) {
    for (const image of images) {
      cache.delete(image);
    }
  } else {
    cache.clear();
  }
}
