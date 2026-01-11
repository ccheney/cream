/**
 * Common/shared types used across domains.
 */

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * API error response.
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * User from better-auth session.
 * Note: Roles have been removed - all authenticated users have full access.
 */
export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  twoFactorEnabled?: boolean;
}

/**
 * Session response from better-auth.
 */
export interface SessionResponse {
  authenticated: boolean;
  user?: User;
}

/**
 * Two-factor authentication setup response.
 */
export interface TwoFactorSetupResponse {
  totpURI: string;
  backupCodes: string[];
}

/**
 * Two-factor verification request.
 */
export interface TwoFactorVerifyRequest {
  code: string;
}

/**
 * Two-factor verification response.
 */
export interface TwoFactorVerifyResponse {
  success: boolean;
}

export type Environment = "BACKTEST" | "PAPER" | "LIVE";
