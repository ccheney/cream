/**
 * Authentication Module
 *
 * Exports all authentication utilities.
 *
 * @see docs/plans/ui/09-security.md
 */

// JWT utilities
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
// MFA utilities
export {
  generateBackupCodes,
  generateOTPAuthURI,
  generateTOTPSecret,
  getCurrentTOTPCode,
  hashBackupCode,
  verifyBackupCode,
  verifyTOTPCode,
} from "./mfa.js";
export type {
  AuthMiddlewareOptions,
  LiveProtectionOptions,
} from "./middleware.js";
// Middleware
export {
  authMiddleware,
  clearAuthCookies,
  DEFAULT_LIVE_PROTECTION,
  liveProtection,
  markMFAVerified,
  optionalAuth,
  requireAuth,
  setAuthCookies,
} from "./middleware.js";
// Role-based authorization
export {
  canPerform,
  getSession,
  hasExactRole,
  hasMinimumRole,
  hasOneOfRoles,
  requireAdmin,
  requireOneOf,
  requireOperator,
  requireRole,
  requireViewer,
} from "./roles.js";
// Types
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
export {
  DEFAULT_COOKIE_CONFIG,
  DEFAULT_JWT_CONFIG,
  ROLE_HIERARCHY,
} from "./types.js";
