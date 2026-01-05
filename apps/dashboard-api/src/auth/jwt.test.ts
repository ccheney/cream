/**
 * JWT Token Utilities Tests
 */

import { describe, expect, it } from "bun:test";
import {
  extractBearerToken,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  getTimeUntilExpiry,
  isTokenExpired,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt.js";
import type { JWTConfig } from "./types.js";

const testConfig: JWTConfig = {
  secret: "test-secret-key-for-testing",
  issuer: "test-issuer",
  accessTokenExpiry: 900, // 15 minutes
  refreshTokenExpiry: 604800, // 7 days
};

describe("generateAccessToken", () => {
  it("generates a valid access token", async () => {
    const token = await generateAccessToken("user-123", "test@example.com", "viewer", testConfig);

    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // JWT has 3 parts
  });

  it("includes correct payload claims", async () => {
    const token = await generateAccessToken("user-123", "test@example.com", "admin", testConfig);

    const payload = await verifyAccessToken(token, testConfig);

    expect(payload.sub).toBe("user-123");
    expect(payload.email).toBe("test@example.com");
    expect(payload.role).toBe("admin");
    expect(payload.type).toBe("access");
    expect(payload.iss).toBe("test-issuer");
  });
});

describe("generateRefreshToken", () => {
  it("generates a valid refresh token", async () => {
    const token = await generateRefreshToken("user-123", undefined, testConfig);

    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
  });

  it("uses provided family", async () => {
    const family = "test-family-123";
    const token = await generateRefreshToken("user-123", family, testConfig);

    const payload = await verifyRefreshToken(token, testConfig);

    expect(payload.family).toBe(family);
  });

  it("generates random family if not provided", async () => {
    const token1 = await generateRefreshToken("user-123", undefined, testConfig);
    const token2 = await generateRefreshToken("user-123", undefined, testConfig);

    const payload1 = await verifyRefreshToken(token1, testConfig);
    const payload2 = await verifyRefreshToken(token2, testConfig);

    expect(payload1.family).not.toBe(payload2.family);
  });
});

describe("generateTokenPair", () => {
  it("generates both access and refresh tokens", async () => {
    const result = await generateTokenPair(
      "user-123",
      "test@example.com",
      "operator",
      undefined,
      testConfig
    );

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.family).toBeDefined();
  });

  it("uses same family for refresh token", async () => {
    const family = "shared-family";
    const result = await generateTokenPair(
      "user-123",
      "test@example.com",
      "viewer",
      family,
      testConfig
    );

    const refreshPayload = await verifyRefreshToken(result.refreshToken, testConfig);

    expect(result.family).toBe(family);
    expect(refreshPayload.family).toBe(family);
  });
});

describe("verifyAccessToken", () => {
  it("verifies valid access token", async () => {
    const token = await generateAccessToken("user-123", "test@example.com", "viewer", testConfig);

    const payload = await verifyAccessToken(token, testConfig);

    expect(payload.sub).toBe("user-123");
    expect(payload.type).toBe("access");
  });

  it("rejects token with wrong secret", async () => {
    const token = await generateAccessToken("user-123", "test@example.com", "viewer", testConfig);

    const wrongConfig = { ...testConfig, secret: "wrong-secret" };

    await expect(verifyAccessToken(token, wrongConfig)).rejects.toThrow();
  });

  it("rejects refresh token as access token", async () => {
    const token = await generateRefreshToken("user-123", undefined, testConfig);

    await expect(verifyAccessToken(token, testConfig)).rejects.toThrow("Invalid token type");
  });
});

describe("verifyRefreshToken", () => {
  it("verifies valid refresh token", async () => {
    const token = await generateRefreshToken("user-123", "family-123", testConfig);

    const payload = await verifyRefreshToken(token, testConfig);

    expect(payload.sub).toBe("user-123");
    expect(payload.type).toBe("refresh");
    expect(payload.family).toBe("family-123");
  });

  it("rejects access token as refresh token", async () => {
    const token = await generateAccessToken("user-123", "test@example.com", "viewer", testConfig);

    await expect(verifyRefreshToken(token, testConfig)).rejects.toThrow("Invalid token type");
  });
});

describe("extractBearerToken", () => {
  it("extracts token from Bearer header", () => {
    const token = extractBearerToken("Bearer my-token-123");
    expect(token).toBe("my-token-123");
  });

  it("returns null for non-Bearer header", () => {
    expect(extractBearerToken("Basic auth-string")).toBeNull();
  });

  it("returns null for malformed header", () => {
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer token extra")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractBearerToken(null)).toBeNull();
  });
});

describe("isTokenExpired", () => {
  it("returns false for future expiry", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    expect(isTokenExpired(futureExp)).toBe(false);
  });

  it("returns true for past expiry", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    expect(isTokenExpired(pastExp)).toBe(true);
  });

  it("returns true for current time", () => {
    const nowExp = Math.floor(Date.now() / 1000);
    expect(isTokenExpired(nowExp)).toBe(true);
  });
});

describe("getTimeUntilExpiry", () => {
  it("returns positive time for future expiry", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const time = getTimeUntilExpiry(futureExp);
    expect(time).toBeGreaterThan(3500);
    expect(time).toBeLessThanOrEqual(3600);
  });

  it("returns 0 for past expiry", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    expect(getTimeUntilExpiry(pastExp)).toBe(0);
  });
});
