/**
 * Authentication Types
 *
 * Type definitions for JWT authentication, roles, and sessions.
 *
 * @see docs/plans/ui/09-security.md
 */

// ============================================
// Roles
// ============================================

/**
 * User roles with ascending permissions.
 */
export type Role = "viewer" | "operator" | "admin";

/**
 * Role hierarchy for permission checks.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

// ============================================
// JWT Payload
// ============================================

/**
 * Access token payload.
 */
export interface AccessTokenPayload {
  /** Subject (user ID) */
  sub: string;
  /** User email */
  email: string;
  /** User role */
  role: Role;
  /** Token type */
  type: "access";
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
  /** Issuer */
  iss: string;
  /** Index signature for JWT compatibility */
  [key: string]: unknown;
}

/**
 * Refresh token payload.
 */
export interface RefreshTokenPayload {
  /** Subject (user ID) */
  sub: string;
  /** Token type */
  type: "refresh";
  /** Token family (for rotation detection) */
  family: string;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
  /** Issuer */
  iss: string;
  /** Index signature for JWT compatibility */
  [key: string]: unknown;
}

// ============================================
// Session
// ============================================

/**
 * User session stored in context.
 */
export interface UserSession {
  userId: string;
  email: string;
  role: Role;
  mfaVerified: boolean;
}

// ============================================
// MFA
// ============================================

/**
 * MFA configuration.
 */
export interface MFAConfig {
  enabled: boolean;
  secret?: string;
  backupCodes?: string[];
  verifiedAt?: Date;
}

// ============================================
// Auth Context
// ============================================

/**
 * Variables added to Hono context by auth middleware.
 */
export interface AuthVariables {
  session: UserSession;
  jwtPayload: AccessTokenPayload;
}

// ============================================
// Configuration
// ============================================

/**
 * JWT configuration.
 */
export interface JWTConfig {
  /** Secret for signing tokens */
  secret: string;
  /** Issuer claim */
  issuer: string;
  /** Access token expiry in seconds (default: 900 = 15min) */
  accessTokenExpiry: number;
  /** Refresh token expiry in seconds (default: 604800 = 7 days) */
  refreshTokenExpiry: number;
}

/**
 * Cookie configuration.
 */
export interface CookieConfig {
  /** Access token cookie name */
  accessTokenName: string;
  /** Refresh token cookie name */
  refreshTokenName: string;
  /** Cookie domain */
  domain?: string;
  /** Cookie path */
  path: string;
  /** Secure flag (HTTPS only) */
  secure: boolean;
  /** SameSite attribute */
  sameSite: "Strict" | "Lax" | "None";
}

/**
 * Default JWT configuration.
 */
export const DEFAULT_JWT_CONFIG: JWTConfig = {
  secret: process.env.JWT_SECRET ?? "development-secret-change-in-production",
  issuer: "cream-dashboard",
  accessTokenExpiry: 15 * 60, // 15 minutes
  refreshTokenExpiry: 7 * 24 * 60 * 60, // 7 days
};

/**
 * Default cookie configuration.
 */
export const DEFAULT_COOKIE_CONFIG: CookieConfig = {
  accessTokenName: "cream_access",
  refreshTokenName: "cream_refresh",
  path: "/",
  secure: process.env.NODE_ENV === "production",
  sameSite: "Strict",
};
