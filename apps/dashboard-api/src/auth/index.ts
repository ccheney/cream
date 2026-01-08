/**
 * Authentication Module
 *
 * Exports authentication utilities for the dashboard API.
 * Uses better-auth for session management and OAuth.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

// ============================================
// Better Auth (primary exports)
// ============================================

// Better Auth instance and types
export { auth, type Session, type User } from "./better-auth.js";

// Session middleware (better-auth based)
export {
  DEFAULT_LIVE_PROTECTION,
  getSession,
  getUser,
  type LiveProtectionOptions,
  liveProtection,
  optionalAuth,
  requireAuth,
  type SessionVariables,
  sessionMiddleware,
} from "./session.js";

// ============================================
// Legacy Exports (deprecated)
// Kept for backwards compatibility during migration.
// These will be removed after full migration to better-auth.
// ============================================

// JWT utilities (deprecated - better-auth handles tokens)
export {
  extractBearerToken,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  getTimeUntilExpiry,
  isTokenExpired,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt.js";

// MFA utilities (deprecated - better-auth handles 2FA)
export {
  generateBackupCodes,
  generateOTPAuthURI,
  generateTOTPSecret,
  getCurrentTOTPCode,
  hashBackupCode,
  verifyBackupCode,
  verifyTOTPCode,
} from "./mfa.js";

// Legacy middleware (deprecated - use session.js exports instead)
export {
  authMiddleware,
  clearAuthCookies,
  liveProtection as liveProtectionLegacy,
  markMFAVerified,
  optionalAuth as optionalAuthLegacy,
  requireAuth as requireAuthLegacy,
  setAuthCookies,
} from "./middleware.js";

// Legacy types (deprecated - use better-auth types instead)
export type {
  AccessTokenPayload,
  AuthVariables,
  CookieConfig,
  JWTConfig,
  MFAConfig,
  RefreshTokenPayload,
  Role,
  UserSession,
} from "./types.js";
export { DEFAULT_COOKIE_CONFIG, DEFAULT_JWT_CONFIG, ROLE_HIERARCHY } from "./types.js";
