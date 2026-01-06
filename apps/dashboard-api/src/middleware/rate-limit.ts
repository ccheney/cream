/**
 * Rate Limiting Middleware
 *
 * Implements sliding window rate limiting for API endpoints.
 * Protects against abuse and ensures fair usage.
 *
 * @see docs/plans/ui/09-security.md API Security
 */

import type { Context, MiddlewareHandler } from "hono";

// ============================================
// Types
// ============================================

interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Custom key generator (defaults to IP + userId) */
  keyGenerator?: (c: Context) => string;
  /** Skip rate limiting for certain requests */
  skip?: (c: Context) => boolean;
  /** Message to return when rate limited */
  message?: string;
}

interface RateLimitEntry {
  /** Timestamps of requests in current window */
  timestamps: number[];
  /** When this entry should be cleaned up */
  expiresAt: number;
}

// ============================================
// Storage
// ============================================

/**
 * In-memory store for rate limit entries.
 * In production, this could be backed by Redis for multi-instance support.
 */
const store = new Map<string, RateLimitEntry>();

/**
 * Cleanup interval for expired entries (every 60 seconds).
 */
const CLEANUP_INTERVAL = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the cleanup timer for expired rate limit entries.
 */
function startCleanup(): void {
  if (cleanupTimer) {
    return;
  }

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt < now) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Don't keep the process alive just for cleanup
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Stop the cleanup timer (for testing/shutdown).
 */
export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Clear all rate limit entries (for testing).
 */
export function clearStore(): void {
  store.clear();
}

// ============================================
// Default Configuration
// ============================================

/** Default: 100 requests per minute */
export const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60_000, // 1 minute
  message: "Too many requests, please try again later",
};

/** Stricter limits for auth endpoints: 10 requests per minute */
export const AUTH_CONFIG: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60_000, // 1 minute
  message: "Too many authentication attempts, please try again later",
};

/** Very strict limits for password reset: 3 requests per 15 minutes */
export const PASSWORD_RESET_CONFIG: RateLimitConfig = {
  maxRequests: 3,
  windowMs: 900_000, // 15 minutes
  message: "Too many password reset attempts, please try again later",
};

// ============================================
// Key Generation
// ============================================

/**
 * Generate a rate limit key from the request.
 * Combines IP address with user ID (if authenticated) and path.
 */
function defaultKeyGenerator(c: Context): string {
  // Get IP from various headers (reverse proxy support)
  const forwarded = c.req.header("x-forwarded-for");
  const realIp = c.req.header("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() ?? realIp ?? "unknown";

  // Get user ID from context if authenticated
  const userId = c.get("userId") as string | undefined;

  // Get the path for per-endpoint limiting
  const path = new URL(c.req.url).pathname;

  return userId ? `${ip}:${userId}:${path}` : `${ip}:${path}`;
}

// ============================================
// Sliding Window Implementation
// ============================================

/**
 * Check and update rate limit for a key.
 * Uses sliding window log algorithm.
 *
 * @returns Object with isLimited flag and metadata
 */
function checkRateLimit(
  key: string,
  config: RateLimitConfig
): {
  isLimited: boolean;
  remaining: number;
  resetAt: number;
  retryAfter: number;
} {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get or create entry
  let entry = store.get(key);
  if (!entry) {
    entry = {
      timestamps: [],
      expiresAt: now + config.windowMs * 2,
    };
    store.set(key, entry);
  }

  // Filter out timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Check if limited
  const isLimited = entry.timestamps.length >= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.timestamps.length);

  // Calculate reset time (when oldest request expires from window)
  const oldestInWindow = entry.timestamps[0] ?? now;
  const resetAt = oldestInWindow + config.windowMs;
  const retryAfter = Math.ceil((resetAt - now) / 1000);

  // If not limited, record this request
  if (!isLimited) {
    entry.timestamps.push(now);
    entry.expiresAt = now + config.windowMs * 2;
  }

  return {
    isLimited,
    remaining: isLimited ? 0 : remaining - 1, // Account for current request
    resetAt,
    retryAfter: Math.max(1, retryAfter),
  };
}

// ============================================
// Middleware Factory
// ============================================

/**
 * Create a rate limiting middleware with the given configuration.
 *
 * @example
 * ```typescript
 * // Default rate limit (100 req/min)
 * app.use("/*", rateLimit());
 *
 * // Stricter limit for auth endpoints
 * app.use("/api/auth/*", rateLimit(AUTH_CONFIG));
 *
 * // Custom configuration
 * app.use("/api/expensive/*", rateLimit({
 *   maxRequests: 10,
 *   windowMs: 60_000,
 *   message: "Rate limit exceeded for expensive operations"
 * }));
 * ```
 */
export function rateLimit(config: Partial<RateLimitConfig> = {}): MiddlewareHandler {
  const mergedConfig: RateLimitConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Start cleanup timer on first use
  startCleanup();

  return async (c, next) => {
    // Check if we should skip rate limiting
    if (mergedConfig.skip?.(c)) {
      return next();
    }

    // Generate key for this request
    const keyGenerator = mergedConfig.keyGenerator ?? defaultKeyGenerator;
    const key = keyGenerator(c);

    // Check rate limit
    const result = checkRateLimit(key, mergedConfig);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(mergedConfig.maxRequests));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (result.isLimited) {
      // Log the rate limit violation
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        "unknown";
      const userId = c.get("userId") as string | undefined;
      const path = new URL(c.req.url).pathname;

      // biome-ignore lint/suspicious/noConsole: Security logging is intentional
      console.warn(
        `[RATE_LIMIT] Blocked request: ip=${ip} userId=${userId ?? "anonymous"} path=${path} limit=${mergedConfig.maxRequests}/${mergedConfig.windowMs}ms`
      );

      // Return 429 Too Many Requests
      c.header("Retry-After", String(result.retryAfter));
      return c.json(
        {
          error: "Too Many Requests",
          message: mergedConfig.message,
          retryAfter: result.retryAfter,
        },
        429
      );
    }

    return next();
  };
}

// ============================================
// Exports
// ============================================

export type { RateLimitConfig };
