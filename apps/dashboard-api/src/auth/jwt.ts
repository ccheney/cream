/**
 * JWT Token Utilities
 *
 * Functions for signing, verifying, and managing JWT tokens.
 *
 * @see docs/plans/ui/09-security.md
 */

import { sign, verify } from "hono/jwt";
import type {
  AccessTokenPayload,
  JWTConfig,
  RefreshTokenPayload,
  Role,
} from "./types.js";
import { DEFAULT_JWT_CONFIG } from "./types.js";

// ============================================
// Token Generation
// ============================================

/**
 * Generate an access token.
 */
export async function generateAccessToken(
  userId: string,
  email: string,
  role: Role,
  config: JWTConfig = DEFAULT_JWT_CONFIG
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const payload: AccessTokenPayload = {
    sub: userId,
    email,
    role,
    type: "access",
    iat: now,
    exp: now + config.accessTokenExpiry,
    iss: config.issuer,
  };

  return sign(payload, config.secret);
}

/**
 * Generate a refresh token.
 */
export async function generateRefreshToken(
  userId: string,
  family?: string,
  config: JWTConfig = DEFAULT_JWT_CONFIG
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const payload: RefreshTokenPayload = {
    sub: userId,
    type: "refresh",
    family: family ?? crypto.randomUUID(),
    iat: now,
    exp: now + config.refreshTokenExpiry,
    iss: config.issuer,
  };

  return sign(payload, config.secret);
}

/**
 * Generate both access and refresh tokens.
 */
export async function generateTokenPair(
  userId: string,
  email: string,
  role: Role,
  family?: string,
  config: JWTConfig = DEFAULT_JWT_CONFIG
): Promise<{ accessToken: string; refreshToken: string; family: string }> {
  const tokenFamily = family ?? crypto.randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(userId, email, role, config),
    generateRefreshToken(userId, tokenFamily, config),
  ]);

  return { accessToken, refreshToken, family: tokenFamily };
}

// ============================================
// Token Verification
// ============================================

/**
 * Verify an access token.
 */
export async function verifyAccessToken(
  token: string,
  config: JWTConfig = DEFAULT_JWT_CONFIG
): Promise<AccessTokenPayload> {
  const payload = await verify(token, config.secret);

  // Validate token type
  if (payload.type !== "access") {
    throw new Error("Invalid token type");
  }

  // Validate issuer
  if (payload.iss !== config.issuer) {
    throw new Error("Invalid token issuer");
  }

  return payload as unknown as AccessTokenPayload;
}

/**
 * Verify a refresh token.
 */
export async function verifyRefreshToken(
  token: string,
  config: JWTConfig = DEFAULT_JWT_CONFIG
): Promise<RefreshTokenPayload> {
  const payload = await verify(token, config.secret);

  // Validate token type
  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }

  // Validate issuer
  if (payload.iss !== config.issuer) {
    throw new Error("Invalid token issuer");
  }

  return payload as unknown as RefreshTokenPayload;
}

// ============================================
// Token Utilities
// ============================================

/**
 * Extract token from Authorization header.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1] ?? null;
}

/**
 * Check if a token is expired.
 */
export function isTokenExpired(exp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= exp;
}

/**
 * Get time until token expires (in seconds).
 */
export function getTimeUntilExpiry(exp: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, exp - now);
}
