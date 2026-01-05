/**
 * Role-Based Authorization
 *
 * Utilities for checking user permissions based on roles.
 *
 * @see docs/plans/ui/09-security.md
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables, Role } from "./types.js";
import { ROLE_HIERARCHY } from "./types.js";

// ============================================
// Permission Checks
// ============================================

/**
 * Check if a role has at least the required permission level.
 */
export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if a role matches exactly.
 */
export function hasExactRole(userRole: Role, requiredRole: Role): boolean {
  return userRole === requiredRole;
}

/**
 * Check if a role is one of the allowed roles.
 */
export function hasOneOfRoles(userRole: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole);
}

// ============================================
// Role Middleware
// ============================================

/**
 * Middleware to require a minimum role level.
 */
export function requireRole(minimumRole: Role): MiddlewareHandler<{
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const session = c.get("session");

    if (!session) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (!hasMinimumRole(session.role, minimumRole)) {
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required: ${minimumRole}, Current: ${session.role}`,
      });
    }

    await next();
  };
}

/**
 * Middleware to require one of specific roles.
 */
export function requireOneOf(allowedRoles: Role[]): MiddlewareHandler<{
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const session = c.get("session");

    if (!session) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (!hasOneOfRoles(session.role, allowedRoles)) {
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required one of: ${allowedRoles.join(", ")}`,
      });
    }

    await next();
  };
}

/**
 * Middleware to require admin role.
 */
export const requireAdmin = requireRole("admin");

/**
 * Middleware to require operator role or higher.
 */
export const requireOperator = requireRole("operator");

/**
 * Middleware to require viewer role or higher (any authenticated user).
 */
export const requireViewer = requireRole("viewer");

// ============================================
// Permission Utilities
// ============================================

/**
 * Get session from context with type safety.
 */
export function getSession(c: Context<{ Variables: AuthVariables }>) {
  return c.get("session");
}

/**
 * Check if the current user can perform an action.
 */
export function canPerform(
  c: Context<{ Variables: AuthVariables }>,
  requiredRole: Role
): boolean {
  const session = c.get("session");
  if (!session) return false;
  return hasMinimumRole(session.role, requiredRole);
}
