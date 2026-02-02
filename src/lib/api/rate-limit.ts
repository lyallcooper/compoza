/**
 * Simple in-memory rate limiter for API routes.
 * Suitable for single-instance deployments (homelab use case).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60000); // Clean up every minute

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Timestamp when the rate limit resets */
  resetAt: number;
}

/**
 * Check if a request should be rate limited.
 * Returns whether the request is allowed and metadata about the rate limit.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { limit: 100, windowMs: 60000 }
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  // If no entry or window has expired, start fresh
  if (!entry || entry.resetAt < now) {
    store.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: now + config.windowMs,
    };
  }

  // Increment count and check limit
  entry.count++;
  const allowed = entry.count <= config.limit;

  return {
    allowed,
    remaining: Math.max(0, config.limit - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Get rate limit key from request.
 * Uses X-Forwarded-For header if available (behind reverse proxy),
 * otherwise falls back to a default key for local requests.
 */
export function getRateLimitKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Use the first IP in the chain (original client)
    return forwarded.split(",")[0].trim();
  }
  // For direct connections, use a default key
  // In a homelab setup behind a reverse proxy, this shouldn't happen often
  return "local";
}

/**
 * Apply rate limiting to a request.
 * Returns a 429 Response if rate limited, or null if allowed.
 *
 * @example
 * export async function POST(request: Request) {
 *   const rateLimited = applyRateLimit(request);
 *   if (rateLimited) return rateLimited;
 *   // ... handle request
 * }
 */
export function applyRateLimit(
  request: Request,
  config?: RateLimitConfig
): Response | null {
  const key = getRateLimitKey(request);
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": result.resetAt.toString(),
          "Retry-After": Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null;
}
