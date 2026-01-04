/**
 * WebSocket Security Module
 *
 * Implements authentication, authorization, and rate limiting for WebSocket connections.
 *
 * @see docs/plans/ui/06-websocket.md lines 14-18
 * @see docs/plans/ui/09-security.md
 */

import type { Channel } from "../../../../packages/domain/src/websocket/channel.js";

// ============================================
// Types
// ============================================

/**
 * User role.
 */
export type UserRole = "user" | "admin";

/**
 * JWT payload structure.
 */
export interface JwtPayload {
  sub: string; // User ID
  role: UserRole;
  exp: number; // Expiration timestamp (seconds)
  iat: number; // Issued at timestamp
}

/**
 * Token validation result.
 */
export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  role?: UserRole;
  expiresAt?: Date;
  error?: string;
  errorCode?: TokenErrorCode;
}

/**
 * Token error codes.
 */
export type TokenErrorCode =
  | "MISSING_TOKEN"
  | "INVALID_FORMAT"
  | "EXPIRED"
  | "INVALID_SIGNATURE"
  | "MALFORMED";

/**
 * Channel permission check result.
 */
export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  reason?: string;
}

/**
 * Security audit event.
 */
export interface SecurityAuditEvent {
  timestamp: string;
  eventType: SecurityEventType;
  userId?: string;
  connectionId?: string;
  channel?: string;
  symbol?: string;
  success: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Security event types.
 */
export type SecurityEventType =
  | "connection.attempt"
  | "connection.rejected"
  | "connection.accepted"
  | "auth.failure"
  | "auth.success"
  | "authorization.denied"
  | "rate_limit.exceeded"
  | "symbol_limit.exceeded"
  | "connection_limit.exceeded"
  | "token.expired"
  | "token.expiring_soon";

// ============================================
// Constants
// ============================================

/**
 * Rate limit configuration.
 */
export const RATE_LIMITS = {
  /** Max subscribe/unsubscribe per second */
  SUBSCRIBE_PER_SECOND: 10,
  /** Max messages per minute */
  MESSAGES_PER_MINUTE: 100,
  /** Max messages per hour */
  MESSAGES_PER_HOUR: 1000,
} as const;

/**
 * Connection limits.
 */
export const CONNECTION_LIMITS = {
  /** Max symbols per connection */
  MAX_SYMBOLS_PER_CONNECTION: 50,
  /** Max connections per user */
  MAX_CONNECTIONS_PER_USER: 5,
} as const;

/**
 * Token expiration warning (seconds before expiry).
 */
export const TOKEN_EXPIRY_WARNING_SECONDS = 30;

/**
 * Allowed origins for WebSocket connections.
 */
export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://cream.app",
  "https://dashboard.cream.app",
];

/**
 * Channel permissions by role.
 */
export const CHANNEL_PERMISSIONS: Record<Channel, UserRole[]> = {
  quotes: ["user", "admin"],
  orders: ["user", "admin"],
  decisions: ["user", "admin"],
  agents: ["admin"],
  cycles: ["admin"],
  alerts: ["user", "admin"],
  system: ["admin"],
  portfolio: ["user", "admin"],
};

// ============================================
// Token Validation
// ============================================

/**
 * Validate a JWT token.
 *
 * Note: In production, use a proper JWT library (jose, jsonwebtoken).
 * This implementation provides the structure for actual JWT validation.
 */
export function validateToken(token: string | null): TokenValidationResult {
  if (!token) {
    return {
      valid: false,
      error: "Missing authentication token",
      errorCode: "MISSING_TOKEN",
    };
  }

  // Remove Bearer prefix
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;

  // Check basic format
  if (cleanToken.length < 10) {
    return {
      valid: false,
      error: "Invalid token format",
      errorCode: "INVALID_FORMAT",
    };
  }

  // For now, use a mock implementation
  // In production, decode and verify JWT signature
  try {
    const payload = decodeTokenPayload(cleanToken);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return {
        valid: false,
        error: "Token expired",
        errorCode: "EXPIRED",
      };
    }

    return {
      valid: true,
      userId: payload.sub,
      role: payload.role,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch {
    return {
      valid: false,
      error: "Malformed token",
      errorCode: "MALFORMED",
    };
  }
}

/**
 * Decode token payload (mock implementation).
 *
 * In production, use jose or jsonwebtoken to properly decode and verify.
 */
export function decodeTokenPayload(token: string): JwtPayload {
  // For development/testing, parse simple format: userId.role.exp
  // e.g., "user123.user.1735999999"
  const parts = token.split(".");

  if (parts.length >= 3) {
    const userId = parts[0];
    const role = parts[1] as UserRole;
    const exp = parseInt(parts[2], 10);

    if (!Number.isNaN(exp) && (role === "user" || role === "admin")) {
      return {
        sub: userId,
        role,
        exp,
        iat: exp - 3600, // Assume 1 hour validity
      };
    }
  }

  // Default mock payload
  return {
    sub: `user-${token.slice(0, 8)}`,
    role: "user",
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
  };
}

/**
 * Check if token is expiring soon.
 */
export function isTokenExpiringSoon(expiresAt: Date): boolean {
  const now = Date.now();
  const expiresIn = expiresAt.getTime() - now;
  return expiresIn > 0 && expiresIn < TOKEN_EXPIRY_WARNING_SECONDS * 1000;
}

/**
 * Check if token is expired.
 */
export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}

// ============================================
// Channel Authorization
// ============================================

/**
 * Check if user role can access channel.
 */
export function canAccessChannel(channel: Channel, role: UserRole): AuthorizationResult {
  const allowedRoles = CHANNEL_PERMISSIONS[channel];

  if (!allowedRoles) {
    return {
      authorized: false,
      reason: `Unknown channel: ${channel}`,
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      authorized: false,
      reason: `Insufficient permissions for channel: ${channel}`,
    };
  }

  return { authorized: true };
}

/**
 * Check if user can access multiple channels.
 */
export function canAccessChannels(
  channels: Channel[],
  role: UserRole
): Map<Channel, AuthorizationResult> {
  const results = new Map<Channel, AuthorizationResult>();
  for (const channel of channels) {
    results.set(channel, canAccessChannel(channel, role));
  }
  return results;
}

/**
 * Filter channels to only those accessible by role.
 */
export function filterAccessibleChannels(channels: Channel[], role: UserRole): Channel[] {
  return channels.filter((channel) => canAccessChannel(channel, role).authorized);
}

// ============================================
// Rate Limiting
// ============================================

/**
 * Rate limiter using token bucket algorithm.
 */
export interface RateLimiter {
  /** Check if action is allowed */
  check(key: string): RateLimitResult;
  /** Record an action */
  record(key: string): void;
  /** Reset rate limit for key */
  reset(key: string): void;
  /** Get current state for key */
  getState(key: string): { count: number; windowStart: Date } | undefined;
}

/**
 * Rate limit bucket state.
 */
interface RateLimitBucket {
  count: number;
  windowStart: number;
}

/**
 * Create a rate limiter.
 */
export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, RateLimitBucket>();

  const getOrCreateBucket = (key: string): RateLimitBucket => {
    const now = Date.now();
    let bucket = buckets.get(key);

    // If bucket doesn't exist or window has passed, create new one
    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(key, bucket);
    }

    return bucket;
  };

  return {
    check(key: string): RateLimitResult {
      const bucket = getOrCreateBucket(key);
      const remaining = maxRequests - bucket.count;
      const resetAt = new Date(bucket.windowStart + windowMs);

      if (bucket.count >= maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          reason: `Rate limit exceeded: ${maxRequests} per ${windowMs}ms`,
        };
      }

      return {
        allowed: true,
        remaining: remaining - 1, // Subtract 1 for the pending action
        resetAt,
      };
    },

    record(key: string): void {
      const bucket = getOrCreateBucket(key);
      bucket.count++;
    },

    reset(key: string): void {
      buckets.delete(key);
    },

    getState(key: string) {
      const bucket = buckets.get(key);
      if (!bucket) {
        return undefined;
      }
      return {
        count: bucket.count,
        windowStart: new Date(bucket.windowStart),
      };
    },
  };
}

// ============================================
// Connection Rate Limiters
// ============================================

/**
 * Subscribe/unsubscribe rate limiter (10/second).
 */
export const subscribeRateLimiter = createRateLimiter(RATE_LIMITS.SUBSCRIBE_PER_SECOND, 1000);

/**
 * Message rate limiter (100/minute).
 */
export const messageRateLimiterMinute = createRateLimiter(RATE_LIMITS.MESSAGES_PER_MINUTE, 60000);

/**
 * Message rate limiter (1000/hour).
 */
export const messageRateLimiterHour = createRateLimiter(RATE_LIMITS.MESSAGES_PER_HOUR, 3600000);

/**
 * Check all message rate limits.
 */
export function checkMessageRateLimit(connectionId: string): RateLimitResult {
  // Check minute limit first (more granular)
  const minuteResult = messageRateLimiterMinute.check(connectionId);
  if (!minuteResult.allowed) {
    return minuteResult;
  }

  // Check hourly limit
  const hourResult = messageRateLimiterHour.check(connectionId);
  if (!hourResult.allowed) {
    return hourResult;
  }

  return minuteResult; // Return the more immediate result
}

/**
 * Record message for rate limiting.
 */
export function recordMessage(connectionId: string): void {
  messageRateLimiterMinute.record(connectionId);
  messageRateLimiterHour.record(connectionId);
}

/**
 * Check subscribe rate limit.
 */
export function checkSubscribeRateLimit(connectionId: string): RateLimitResult {
  return subscribeRateLimiter.check(connectionId);
}

/**
 * Record subscribe for rate limiting.
 */
export function recordSubscribe(connectionId: string): void {
  subscribeRateLimiter.record(connectionId);
}

// ============================================
// Connection Limits
// ============================================

/**
 * Connection tracking.
 */
interface ConnectionTracker {
  /** Check if user can open new connection */
  canConnect(userId: string): boolean;
  /** Record new connection */
  addConnection(userId: string, connectionId: string): void;
  /** Remove connection */
  removeConnection(userId: string, connectionId: string): void;
  /** Get connection count for user */
  getConnectionCount(userId: string): number;
  /** Get all connection IDs for user */
  getConnectionIds(userId: string): string[];
}

/**
 * Create connection tracker.
 */
export function createConnectionTracker(): ConnectionTracker {
  const userConnections = new Map<string, Set<string>>();

  return {
    canConnect(userId: string): boolean {
      const connections = userConnections.get(userId);
      const count = connections?.size ?? 0;
      return count < CONNECTION_LIMITS.MAX_CONNECTIONS_PER_USER;
    },

    addConnection(userId: string, connectionId: string): void {
      let connections = userConnections.get(userId);
      if (!connections) {
        connections = new Set();
        userConnections.set(userId, connections);
      }
      connections.add(connectionId);
    },

    removeConnection(userId: string, connectionId: string): void {
      const connections = userConnections.get(userId);
      if (connections) {
        connections.delete(connectionId);
        if (connections.size === 0) {
          userConnections.delete(userId);
        }
      }
    },

    getConnectionCount(userId: string): number {
      return userConnections.get(userId)?.size ?? 0;
    },

    getConnectionIds(userId: string): string[] {
      return Array.from(userConnections.get(userId) ?? []);
    },
  };
}

/**
 * Global connection tracker.
 */
export const connectionTracker = createConnectionTracker();

// ============================================
// Symbol Subscription Limits
// ============================================

/**
 * Symbol subscription tracker.
 */
interface SymbolTracker {
  /** Check if connection can subscribe to more symbols */
  canSubscribe(connectionId: string, symbolCount: number): boolean;
  /** Get current symbol count for connection */
  getSymbolCount(connectionId: string): number;
  /** Set symbol count for connection */
  setSymbolCount(connectionId: string, count: number): void;
  /** Remove connection tracking */
  removeConnection(connectionId: string): void;
}

/**
 * Create symbol tracker.
 */
export function createSymbolTracker(): SymbolTracker {
  const symbolCounts = new Map<string, number>();

  return {
    canSubscribe(connectionId: string, symbolCount: number): boolean {
      const current = symbolCounts.get(connectionId) ?? 0;
      const total = current + symbolCount;
      return total <= CONNECTION_LIMITS.MAX_SYMBOLS_PER_CONNECTION;
    },

    getSymbolCount(connectionId: string): number {
      return symbolCounts.get(connectionId) ?? 0;
    },

    setSymbolCount(connectionId: string, count: number): void {
      if (count <= 0) {
        symbolCounts.delete(connectionId);
      } else {
        symbolCounts.set(connectionId, count);
      }
    },

    removeConnection(connectionId: string): void {
      symbolCounts.delete(connectionId);
    },
  };
}

/**
 * Global symbol tracker.
 */
export const symbolTracker = createSymbolTracker();

// ============================================
// Origin Validation
// ============================================

/**
 * Validate request origin.
 */
export function validateOrigin(origin: string | null): boolean {
  if (!origin) {
    return false;
  }

  // In development, allow all localhost origins
  if (origin.startsWith("http://localhost:")) {
    return true;
  }

  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Add allowed origin.
 */
export function addAllowedOrigin(origin: string): void {
  if (!ALLOWED_ORIGINS.includes(origin)) {
    (ALLOWED_ORIGINS as string[]).push(origin);
  }
}

// ============================================
// Audit Logging
// ============================================

/**
 * Audit log storage.
 */
const auditLog: SecurityAuditEvent[] = [];

/**
 * Max audit log entries to keep in memory.
 */
const MAX_AUDIT_LOG_SIZE = 10000;

/**
 * Log security event.
 */
export function logSecurityEvent(event: Omit<SecurityAuditEvent, "timestamp">): void {
  const fullEvent: SecurityAuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  auditLog.push(fullEvent);

  // Trim log if too large
  if (auditLog.length > MAX_AUDIT_LOG_SIZE) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_LOG_SIZE);
  }

  // Also log to console for immediate visibility
  const _level = event.success ? "info" : "warn";
}

/**
 * Get audit log entries.
 */
export function getAuditLog(
  filter?: {
    eventType?: SecurityEventType;
    userId?: string;
    connectionId?: string;
    success?: boolean;
    since?: Date;
  },
  limit = 100
): SecurityAuditEvent[] {
  let filtered = auditLog;

  if (filter) {
    filtered = auditLog.filter((event) => {
      if (filter.eventType && event.eventType !== filter.eventType) {
        return false;
      }
      if (filter.userId && event.userId !== filter.userId) {
        return false;
      }
      if (filter.connectionId && event.connectionId !== filter.connectionId) {
        return false;
      }
      if (filter.success !== undefined && event.success !== filter.success) {
        return false;
      }
      if (filter.since && new Date(event.timestamp) < filter.since) {
        return false;
      }
      return true;
    });
  }

  // Return most recent entries
  return filtered.slice(-limit);
}

/**
 * Clear audit log (for testing).
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Perform full connection security check.
 */
export function checkConnectionSecurity(
  token: string | null,
  userId: string,
  origin: string | null
): { allowed: boolean; error?: string; tokenResult?: TokenValidationResult } {
  // Validate origin
  if (!validateOrigin(origin)) {
    logSecurityEvent({
      eventType: "connection.rejected",
      userId,
      success: false,
      reason: "Invalid origin",
      metadata: { origin },
    });
    return { allowed: false, error: "Invalid origin" };
  }

  // Validate token
  const tokenResult = validateToken(token);
  if (!tokenResult.valid) {
    logSecurityEvent({
      eventType: "auth.failure",
      userId,
      success: false,
      reason: tokenResult.error,
      metadata: { errorCode: tokenResult.errorCode },
    });
    return { allowed: false, error: tokenResult.error, tokenResult };
  }

  // Check connection limit
  if (!connectionTracker.canConnect(tokenResult.userId!)) {
    logSecurityEvent({
      eventType: "connection_limit.exceeded",
      userId: tokenResult.userId,
      success: false,
      reason: `Max ${CONNECTION_LIMITS.MAX_CONNECTIONS_PER_USER} connections per user`,
    });
    return {
      allowed: false,
      error: "Connection limit exceeded",
      tokenResult,
    };
  }

  logSecurityEvent({
    eventType: "connection.accepted",
    userId: tokenResult.userId,
    success: true,
  });

  return { allowed: true, tokenResult };
}

/**
 * Perform channel subscription security check.
 */
export function checkSubscriptionSecurity(
  connectionId: string,
  userId: string,
  role: UserRole,
  channels: Channel[]
): { allowed: boolean; authorizedChannels: Channel[]; errors: string[] } {
  const errors: string[] = [];

  // Check rate limit
  const rateResult = checkSubscribeRateLimit(connectionId);
  if (!rateResult.allowed) {
    logSecurityEvent({
      eventType: "rate_limit.exceeded",
      connectionId,
      userId,
      success: false,
      reason: rateResult.reason,
    });
    return { allowed: false, authorizedChannels: [], errors: [rateResult.reason!] };
  }

  // Filter to authorized channels
  const authorizedChannels: Channel[] = [];
  for (const channel of channels) {
    const authResult = canAccessChannel(channel, role);
    if (authResult.authorized) {
      authorizedChannels.push(channel);
    } else {
      errors.push(authResult.reason!);
      logSecurityEvent({
        eventType: "authorization.denied",
        connectionId,
        userId,
        channel,
        success: false,
        reason: authResult.reason,
      });
    }
  }

  // Record rate limit
  recordSubscribe(connectionId);

  return {
    allowed: authorizedChannels.length > 0,
    authorizedChannels,
    errors,
  };
}

/**
 * Check symbol subscription security.
 */
export function checkSymbolSubscriptionSecurity(
  connectionId: string,
  userId: string,
  newSymbols: string[]
): { allowed: boolean; error?: string } {
  if (!symbolTracker.canSubscribe(connectionId, newSymbols.length)) {
    logSecurityEvent({
      eventType: "symbol_limit.exceeded",
      connectionId,
      userId,
      success: false,
      reason: `Max ${CONNECTION_LIMITS.MAX_SYMBOLS_PER_CONNECTION} symbols per connection`,
      metadata: { requestedCount: newSymbols.length },
    });
    return {
      allowed: false,
      error: `Symbol limit exceeded: max ${CONNECTION_LIMITS.MAX_SYMBOLS_PER_CONNECTION} symbols`,
    };
  }

  return { allowed: true };
}

// ============================================
// Exports
// ============================================

export default {
  validateToken,
  canAccessChannel,
  checkConnectionSecurity,
  checkSubscriptionSecurity,
  checkSymbolSubscriptionSecurity,
  logSecurityEvent,
  getAuditLog,
};
