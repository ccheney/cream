/**
 * Authentication Module
 *
 * Exports all authentication utilities.
 *
 * @see docs/plans/ui/09-security.md
 */

// Types
export type {
  Role,
  AccessTokenPayload,
  RefreshTokenPayload,
  UserSession,
  MFAConfig,
  AuthVariables,
  JWTConfig,
  CookieConfig,
} from "./types.js";

export {
  ROLE_HIERARCHY,
  DEFAULT_JWT_CONFIG,
  DEFAULT_COOKIE_CONFIG,
} from "./types.js";

// JWT utilities
export {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  extractBearerToken,
  isTokenExpired,
  getTimeUntilExpiry,
} from "./jwt.js";

// Role-based authorization
export {
  hasMinimumRole,
  hasExactRole,
  hasOneOfRoles,
  requireRole,
  requireOneOf,
  requireAdmin,
  requireOperator,
  requireViewer,
  getSession,
  canPerform,
} from "./roles.js";

// MFA utilities
export {
  generateTOTPSecret,
  verifyTOTPCode,
  getCurrentTOTPCode,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  generateOTPAuthURI,
} from "./mfa.js";

// Middleware
export {
  setAuthCookies,
  clearAuthCookies,
  authMiddleware,
  requireAuth,
  optionalAuth,
  liveProtection,
  markMFAVerified,
  DEFAULT_LIVE_PROTECTION,
} from "./middleware.js";

export type {
  AuthMiddlewareOptions,
  LiveProtectionOptions,
} from "./middleware.js";
