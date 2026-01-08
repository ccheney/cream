/**
 * Authentication Types
 *
 * Type definitions for authentication and sessions.
 * Uses better-auth for session management.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

// Re-export better-auth types
export type { Session, User } from "./better-auth.js";

// ============================================
// Session Variables
// ============================================

/**
 * Variables added to Hono context by session middleware.
 * Uses better-auth Session type.
 */
export type { SessionVariables } from "./session.js";

// ============================================
// Legacy Types (deprecated - kept for backward compatibility)
// These will be removed in a future version.
// ============================================

/**
 * @deprecated Use better-auth Session instead. Roles have been removed.
 */
export type Role = "viewer" | "operator" | "admin";

/**
 * @deprecated Roles have been removed. All authenticated users have full access.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

/**
 * @deprecated Use better-auth Session instead.
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access";
  iat: number;
  exp: number;
  iss: string;
  [key: string]: unknown;
}

/**
 * @deprecated Use better-auth for token refresh.
 */
export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
  family: string;
  iat: number;
  exp: number;
  iss: string;
  [key: string]: unknown;
}

/**
 * @deprecated Use better-auth Session instead.
 */
export interface UserSession {
  userId: string;
  email: string;
  role: Role;
  mfaVerified: boolean;
}

/**
 * @deprecated Use better-auth for 2FA.
 */
export interface MFAConfig {
  enabled: boolean;
  secret?: string;
  backupCodes?: string[];
  verifiedAt?: Date;
}

/**
 * @deprecated Use SessionVariables from ./session.js instead.
 */
export interface AuthVariables {
  session: UserSession;
  jwtPayload: AccessTokenPayload;
}

/**
 * @deprecated JWT is handled by better-auth.
 */
export interface JWTConfig {
  secret: string;
  issuer: string;
  accessTokenExpiry: number;
  refreshTokenExpiry: number;
}

/**
 * @deprecated Cookies are handled by better-auth.
 */
export interface CookieConfig {
  accessTokenName: string;
  refreshTokenName: string;
  domain?: string;
  path: string;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

/**
 * @deprecated JWT is handled by better-auth.
 */
export const DEFAULT_JWT_CONFIG: JWTConfig = {
  secret: process.env.JWT_SECRET ?? "development-secret-change-in-production",
  issuer: "cream-dashboard",
  accessTokenExpiry: 15 * 60,
  refreshTokenExpiry: 7 * 24 * 60 * 60,
};

/**
 * @deprecated Cookies are handled by better-auth.
 */
export const DEFAULT_COOKIE_CONFIG: CookieConfig = {
  accessTokenName: "cream_access",
  refreshTokenName: "cream_refresh",
  path: "/",
  secure: process.env.CREAM_ENV === "LIVE",
  sameSite: "Strict",
};
