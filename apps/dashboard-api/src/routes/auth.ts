/**
 * Authentication Routes
 *
 * Routes for login, logout, refresh, and MFA.
 *
 * @see docs/plans/ui/09-security.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import {
  type AuthVariables,
  clearAuthCookies,
  DEFAULT_COOKIE_CONFIG,
  generateBackupCodes,
  generateOTPAuthURI,
  generateTOTPSecret,
  generateTokenPair,
  hashBackupCode,
  type Role,
  requireAuth,
  setAuthCookies,
  verifyRefreshToken,
  verifyTOTPCode,
} from "../auth/index.js";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono<{ Variables: AuthVariables }>();

// ============================================
// Schema Definitions
// ============================================

const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginResponseSchema = z.object({
  success: z.boolean(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: z.enum(["viewer", "operator", "admin"]),
  }),
  mfaRequired: z.boolean(),
});

const RefreshResponseSchema = z.object({
  success: z.boolean(),
});

const MFASetupResponseSchema = z.object({
  secret: z.string(),
  qrCodeUri: z.string(),
  backupCodes: z.array(z.string()),
});

const MFAVerifyRequestSchema = z.object({
  code: z.string().length(6),
});

const MFAVerifyResponseSchema = z.object({
  success: z.boolean(),
  mfaVerified: z.boolean(),
});

const SessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      role: z.enum(["viewer", "operator", "admin"]),
      mfaVerified: z.boolean(),
    })
    .optional(),
});

// ============================================
// Mock User Store (replace with real DB)
// ============================================

interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  mfaSecret?: string;
  mfaBackupCodes?: string[];
}

// In-memory mock users for development
const mockUsers: Map<string, MockUser> = new Map([
  [
    "user@example.com",
    {
      id: "user-1",
      email: "user@example.com",
      passwordHash: "dolladollabillyall", // In production, this would be hashed
      role: "viewer",
    },
  ],
  [
    "operator@example.com",
    {
      id: "user-2",
      email: "operator@example.com",
      passwordHash: "password123",
      role: "operator",
    },
  ],
  [
    "admin@example.com",
    {
      id: "user-3",
      email: "admin@example.com",
      passwordHash: "password123",
      role: "admin",
    },
  ],
]);

// ============================================
// Routes
// ============================================

// POST /login - Authenticate user
const loginRoute = createRoute({
  method: "post",
  path: "/login",
  request: {
    body: {
      content: {
        "application/json": {
          schema: LoginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: LoginResponseSchema,
        },
      },
      description: "Login successful",
    },
    401: {
      description: "Invalid credentials",
    },
  },
  tags: ["Auth"],
});

app.openapi(loginRoute, async (c) => {
  const { email, password } = c.req.valid("json");

  // Look up user (in production, query database)
  const user = mockUsers.get(email);

  if (!user || user.passwordHash !== password) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  // Generate tokens
  const { accessToken, refreshToken } = await generateTokenPair(user.id, user.email, user.role);

  // Set httpOnly cookies
  setAuthCookies(c, accessToken, refreshToken);

  // Check if MFA is enabled
  const mfaRequired = !!user.mfaSecret && process.env.CREAM_ENV === "LIVE";

  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    mfaRequired,
  });
});

// POST /logout - Clear authentication
const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: "Logout successful",
    },
  },
  tags: ["Auth"],
});

app.openapi(logoutRoute, (c) => {
  clearAuthCookies(c);
  return c.json({ success: true });
});

// POST /refresh - Refresh access token
const refreshRoute = createRoute({
  method: "post",
  path: "/refresh",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: RefreshResponseSchema,
        },
      },
      description: "Token refreshed",
    },
    401: {
      description: "Invalid refresh token",
    },
  },
  tags: ["Auth"],
});

app.openapi(refreshRoute, async (c) => {
  const refreshToken = getCookie(c, DEFAULT_COOKIE_CONFIG.refreshTokenName);

  if (!refreshToken) {
    throw new HTTPException(401, { message: "No refresh token" });
  }

  try {
    // Verify refresh token
    const payload = await verifyRefreshToken(refreshToken);

    // Look up user (in production, query database)
    let user: MockUser | undefined;
    for (const u of mockUsers.values()) {
      if (u.id === payload.sub) {
        user = u;
        break;
      }
    }

    if (!user) {
      throw new HTTPException(401, { message: "User not found" });
    }

    // Generate new token pair with same family (for rotation tracking)
    const { accessToken, refreshToken: newRefreshToken } = await generateTokenPair(
      user.id,
      user.email,
      user.role,
      payload.family
    );

    // Set new cookies
    setAuthCookies(c, accessToken, newRefreshToken);

    return c.json({ success: true });
  } catch {
    clearAuthCookies(c);
    throw new HTTPException(401, { message: "Invalid refresh token" });
  }
});

// GET /session - Get current session
const _sessionRoute = createRoute({
  method: "get",
  path: "/session",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SessionResponseSchema,
        },
      },
      description: "Session info",
    },
  },
  tags: ["Auth"],
});

// Use optional auth for session check
app.get(
  "/session",
  async (c, next) => {
    // Manually check auth without throwing
    const { authMiddleware } = await import("../auth/middleware.js");
    const optionalAuth = authMiddleware({ optional: true });
    return optionalAuth(c, next);
  },
  (c) => {
    const session = c.get("session");

    if (!session) {
      return c.json({ authenticated: false });
    }

    return c.json({
      authenticated: true,
      user: {
        id: session.userId,
        email: session.email,
        role: session.role,
        mfaVerified: session.mfaVerified,
      },
    });
  }
);

// POST /mfa/setup - Set up MFA
const mfaSetupRoute = createRoute({
  method: "post",
  path: "/mfa/setup",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: MFASetupResponseSchema,
        },
      },
      description: "MFA setup data",
    },
    401: {
      description: "Authentication required",
    },
  },
  tags: ["Auth", "MFA"],
});

app.use("/mfa/*", requireAuth);

app.openapi(mfaSetupRoute, async (c) => {
  const session = c.get("session");

  // Generate TOTP secret
  const secret = generateTOTPSecret();

  // Generate backup codes
  const backupCodes = generateBackupCodes(10);

  // Hash backup codes for storage
  const hashedCodes = await Promise.all(backupCodes.map(hashBackupCode));

  // Store in user (in production, save to database)
  const user = mockUsers.get(session.email);
  if (user) {
    user.mfaSecret = secret;
    user.mfaBackupCodes = hashedCodes;
  }

  // Generate QR code URI
  const qrCodeUri = generateOTPAuthURI(secret, session.email);

  return c.json({
    secret,
    qrCodeUri,
    backupCodes,
  });
});

// POST /mfa/verify - Verify MFA code
const mfaVerifyRoute = createRoute({
  method: "post",
  path: "/mfa/verify",
  request: {
    body: {
      content: {
        "application/json": {
          schema: MFAVerifyRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: MFAVerifyResponseSchema,
        },
      },
      description: "MFA verification result",
    },
    401: {
      description: "Invalid MFA code",
    },
  },
  tags: ["Auth", "MFA"],
});

app.openapi(mfaVerifyRoute, async (c) => {
  const session = c.get("session");
  const { code } = c.req.valid("json");

  // Get user's MFA secret (in production, query database)
  const user = mockUsers.get(session.email);

  if (!user?.mfaSecret) {
    throw new HTTPException(400, { message: "MFA not set up" });
  }

  // Verify TOTP code
  const isValid = await verifyTOTPCode(user.mfaSecret, code);

  if (!isValid) {
    throw new HTTPException(401, { message: "Invalid MFA code" });
  }

  // Mark session as MFA verified
  session.mfaVerified = true;
  c.set("session", session);

  // In production, you would issue a new token with MFA claim

  return c.json({
    success: true,
    mfaVerified: true,
  });
});

// ============================================
// Export
// ============================================

export const authRoutes = app;
export default authRoutes;
