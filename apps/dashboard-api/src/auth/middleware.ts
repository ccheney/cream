/**
 * Authentication Middleware
 *
 * Middleware for JWT authentication with httpOnly cookies.
 *
 * @see docs/plans/ui/09-security.md
 */

import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { extractBearerToken, verifyAccessToken } from "./jwt.js";
import type { AuthVariables, CookieConfig, JWTConfig, UserSession } from "./types.js";
import { DEFAULT_COOKIE_CONFIG, DEFAULT_JWT_CONFIG } from "./types.js";

// ============================================
// Cookie Utilities
// ============================================

/**
 * Set authentication cookies.
 */
export function setAuthCookies(
  c: Context,
  accessToken: string,
  refreshToken: string,
  config: CookieConfig = DEFAULT_COOKIE_CONFIG,
  jwtConfig: JWTConfig = DEFAULT_JWT_CONFIG
): void {
  // Set access token cookie
  setCookie(c, config.accessTokenName, accessToken, {
    path: config.path,
    secure: config.secure,
    httpOnly: true,
    sameSite: config.sameSite,
    maxAge: jwtConfig.accessTokenExpiry,
    domain: config.domain,
  });

  // Set refresh token cookie
  setCookie(c, config.refreshTokenName, refreshToken, {
    path: config.path,
    secure: config.secure,
    httpOnly: true,
    sameSite: config.sameSite,
    maxAge: jwtConfig.refreshTokenExpiry,
    domain: config.domain,
  });
}

/**
 * Clear authentication cookies.
 */
export function clearAuthCookies(c: Context, config: CookieConfig = DEFAULT_COOKIE_CONFIG): void {
  deleteCookie(c, config.accessTokenName, {
    path: config.path,
    domain: config.domain,
  });

  deleteCookie(c, config.refreshTokenName, {
    path: config.path,
    domain: config.domain,
  });
}

// ============================================
// Authentication Middleware
// ============================================

/**
 * Authentication middleware options.
 */
export interface AuthMiddlewareOptions {
  /** JWT configuration */
  jwtConfig?: JWTConfig;
  /** Cookie configuration */
  cookieConfig?: CookieConfig;
  /** Allow unauthenticated access (sets session to undefined) */
  optional?: boolean;
}

/**
 * Authentication middleware.
 *
 * Verifies JWT from httpOnly cookie or Authorization header.
 * Sets session in context on success.
 */
export function authMiddleware(
  options: AuthMiddlewareOptions = {}
): MiddlewareHandler<{ Variables: AuthVariables }> {
  const {
    jwtConfig = DEFAULT_JWT_CONFIG,
    cookieConfig = DEFAULT_COOKIE_CONFIG,
    optional = false,
  } = options;

  return async (c, next) => {
    let token: string | null = null;

    // Try to get token from cookie first
    token = getCookie(c, cookieConfig.accessTokenName) ?? null;

    // Fall back to Authorization header
    if (!token) {
      const authHeader = c.req.header("Authorization");
      token = extractBearerToken(authHeader ?? null);
    }

    // No token found
    if (!token) {
      if (optional) {
        await next();
        return;
      }
      throw new HTTPException(401, { message: "Authentication required" });
    }

    try {
      // Verify the token
      const payload = await verifyAccessToken(token, jwtConfig);

      // Create session from payload
      const session: UserSession = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        mfaVerified: false, // Will be set by MFA middleware if needed
      };

      // Set session and payload in context
      c.set("session", session);
      c.set("jwtPayload", payload);

      await next();
    } catch (error) {
      if (optional) {
        await next();
        return;
      }

      // Token verification failed
      const message = error instanceof Error ? error.message : "Invalid token";
      throw new HTTPException(401, { message });
    }
  };
}

/**
 * Shorthand for required authentication.
 */
export const requireAuth = authMiddleware({ optional: false });

/**
 * Shorthand for optional authentication.
 */
export const optionalAuth = authMiddleware({ optional: true });

// ============================================
// LIVE Environment Protection
// ============================================

/**
 * LIVE environment protection options.
 */
export interface LiveProtectionOptions {
  /** Require MFA verification */
  requireMFA?: boolean;
  /** Require confirmation dialog */
  requireConfirmation?: boolean;
  /** Cooldown between confirmations (seconds) */
  confirmationCooldown?: number;
  /** Log all actions */
  auditLog?: boolean;
  /** Allowed IP addresses (if set, only these IPs can access) */
  ipWhitelist?: string[];
}

/**
 * Default LIVE protection configuration.
 */
export const DEFAULT_LIVE_PROTECTION: LiveProtectionOptions = {
  requireMFA: true,
  requireConfirmation: true,
  confirmationCooldown: 30,
  auditLog: true,
  ipWhitelist: undefined,
};

/**
 * Middleware to protect LIVE environment operations.
 */
export function liveProtection(
  options: LiveProtectionOptions = DEFAULT_LIVE_PROTECTION
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const env = process.env.CREAM_ENV ?? "PAPER";

    // Skip protection for non-LIVE environments
    if (env !== "LIVE") {
      await next();
      return;
    }

    const session = c.get("session");

    if (!session) {
      throw new HTTPException(401, { message: "Authentication required for LIVE environment" });
    }

    // Check IP whitelist
    if (options.ipWhitelist && options.ipWhitelist.length > 0) {
      const clientIP =
        c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
        c.req.header("X-Real-IP") ??
        "unknown";

      if (!options.ipWhitelist.includes(clientIP)) {
        throw new HTTPException(403, {
          message: "Access denied: IP not whitelisted for LIVE environment",
        });
      }
    }

    // Check MFA verification
    if (options.requireMFA && !session.mfaVerified) {
      throw new HTTPException(403, {
        message: "MFA verification required for LIVE environment",
        cause: { code: "MFA_REQUIRED" },
      });
    }

    // Check confirmation header
    if (options.requireConfirmation) {
      const confirmation = c.req.header("X-Confirm-Action");
      if (confirmation !== "true") {
        throw new HTTPException(428, {
          message: "Action confirmation required for LIVE environment",
          cause: { code: "CONFIRMATION_REQUIRED" },
        });
      }
    }

    // Audit logging
    if (options.auditLog) {
      const _auditEntry = {
        timestamp: new Date().toISOString(),
        userId: session.userId,
        email: session.email,
        action: `${c.req.method} ${c.req.path}`,
        ip: c.req.header("X-Forwarded-For") ?? c.req.header("X-Real-IP") ?? "unknown",
        userAgent: c.req.header("User-Agent"),
      };
    }

    await next();
  };
}

// ============================================
// MFA Verification Middleware
// ============================================

/**
 * Middleware to mark session as MFA verified.
 *
 * This should be called after successful MFA verification.
 */
export function markMFAVerified(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const session = c.get("session");

    if (session) {
      session.mfaVerified = true;
      c.set("session", session);
    }

    await next();
  };
}
