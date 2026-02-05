export interface CachedUpdate {
  image: string;
  updateAvailable: boolean;
  status: "checked" | "unknown" | "error";
  checkedAt: number;
  expiresAt: number;
  // Digest information
  currentDigest?: string;
  latestDigest?: string;
  // Resolved version information
  currentVersion?: string;
  latestVersion?: string;
  versionStatus?: "pending" | "resolved" | "failed";
}

// In-memory cache with TTL
// Use globalThis to persist across Next.js hot reloads in development
const globalCache = globalThis as typeof globalThis & {
  __updateCache?: Map<string, CachedUpdate>;
  __pendingChecks?: Set<string>;
};

if (!globalCache.__updateCache) {
  globalCache.__updateCache = new Map<string, CachedUpdate>();
  globalCache.__pendingChecks = new Set<string>();
}

const cache = globalCache.__updateCache;
const pendingChecks = globalCache.__pendingChecks!;

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const PENDING_CHECK_TIMEOUT = 5 * 60 * 1000; // 5 minutes max for pending checks

// Track when pending checks started for cleanup
const pendingCheckTimestamps = new Map<string, number>();

// Periodic cleanup of expired cache entries and stale pending checks
setInterval(() => {
  const now = Date.now();

  // Clean expired cache entries
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) {
      cache.delete(key);
    }
  }

  // Clean stale pending checks (stuck for more than 5 minutes)
  for (const [key, startTime] of pendingCheckTimestamps) {
    if (now - startTime > PENDING_CHECK_TIMEOUT) {
      pendingChecks.delete(key);
      pendingCheckTimestamps.delete(key);
    }
  }
}, 60000); // Clean every minute
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes between checks for same image

export function getCachedUpdate(image: string): CachedUpdate | null {
  const cached = cache.get(image);
  if (!cached) return null;

  // Return cached value if not expired
  if (Date.now() < cached.expiresAt) {
    return cached;
  }

  return null;
}

export function setCachedUpdate(
  image: string,
  update: Omit<CachedUpdate, "checkedAt" | "expiresAt">,
  ttl: number = CACHE_TTL
): void {
  const now = Date.now();
  cache.set(image, {
    ...update,
    checkedAt: now,
    expiresAt: now + ttl,
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
  pendingCheckTimestamps.set(image, Date.now());
}

export function markCheckComplete(image: string): void {
  pendingChecks.delete(image);
  pendingCheckTimestamps.delete(image);
}

export function getAllCachedUpdates(): CachedUpdate[] {
  const now = Date.now();
  const results: CachedUpdate[] = [];

  for (const [, cached] of cache) {
    if (now < cached.expiresAt) {
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
