/**
 * Authentication Module
 *
 * Exports authentication utilities for the dashboard API.
 * Uses better-auth for session management and OAuth.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

// Better Auth instance and types
export { auth, type Session, type User } from "./better-auth.js";

// Session middleware (better-auth based)
export {
  DEFAULT_LIVE_PROTECTION,
  getSession,
  getUser,
  type LiveProtectionOptions,
  liveProtection as liveProtectionNew,
  optionalAuth as optionalAuthNew,
  requireAuth as requireAuthNew,
  type SessionVariables,
  sessionMiddleware,
} from "./session.js";

// ============================================
// Legacy Exports (kept for backwards compatibility during migration)
// These will be removed after full migration to better-auth
// ============================================

// JWT utilities (legacy - better-auth handles tokens)
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

// MFA utilities (legacy - better-auth handles 2FA)
export {
  generateBackupCodes,
  generateOTPAuthURI,
  generateTOTPSecret,
  getCurrentTOTPCode,
  hashBackupCode,
  verifyBackupCode,
  verifyTOTPCode,
} from "./mfa.js";
// Legacy middleware exports (for routes still using old patterns)
export {
  authMiddleware,
  clearAuthCookies,
  liveProtection,
  markMFAVerified,
  optionalAuth,
  requireAuth,
  setAuthCookies,
} from "./middleware.js";
// Legacy types (kept for backwards compatibility)
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
