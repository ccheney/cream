/**
 * Better Auth Integration Tests
 *
 * Tests for OAuth flow, session management, and MFA using testcontainers.
 * Uses an in-memory SQLite database for testing instead of Turso container
 * since better-auth works with SQLite directly.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.BETTER_AUTH_URL = "http://localhost:3001";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { TursoClient } from "@cream/storage";
import { createInMemoryClient, runMigrations } from "@cream/storage";

// ============================================
// Test Setup
// ============================================

let dbClient: TursoClient;

// ============================================
// Test Fixtures
// ============================================

function createMockUser() {
	return {
		id: `user-${Date.now()}`,
		email: `test-${Date.now()}@example.com`,
		name: "Test User",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

function createMockSession(userId: string) {
	return {
		id: `session-${Date.now()}`,
		userId,
		token: `token-${Date.now()}`,
		expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

// ============================================
// Integration Tests
// ============================================

describe("Better Auth Integration Tests", () => {
	beforeAll(async () => {
		// Create in-memory database client
		dbClient = await createInMemoryClient();

		// Run migrations to create better-auth tables
		await runMigrations(dbClient, { logger: () => {} });
	}, 60000);

	afterAll(async () => {
		if (dbClient?.close) {
			await dbClient.close();
		}
	});

	afterEach(async () => {
		// Clean up test data between tests
		await dbClient.run("DELETE FROM session");
		await dbClient.run("DELETE FROM account");
		await dbClient.run("DELETE FROM two_factor");
		await dbClient.run("DELETE FROM verification");
		await dbClient.run("DELETE FROM user");
	});

	// ============================================
	// User Creation Tests
	// ============================================

	describe("User Creation", () => {
		it("creates a new user with required fields", async () => {
			const user = createMockUser();

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, Date.now(), Date.now()]
			);

			const result = await dbClient.get<{ id: string; email: string; name: string }>(
				"SELECT id, email, name FROM user WHERE id = ?",
				[user.id]
			);

			expect(result).toBeDefined();
			expect(result?.email).toBe(user.email);
			expect(result?.name).toBe(user.name);
		});

		it("enforces unique email constraint", async () => {
			const user = createMockUser();

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, Date.now(), Date.now()]
			);

			// Try to insert duplicate email
			await expect(
				dbClient.run(
					`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
					[`user-${Date.now() + 1}`, "Another User", user.email, 1, Date.now(), Date.now()]
				)
			).rejects.toThrow();
		});
	});

	// ============================================
	// Session Management Tests
	// ============================================

	describe("Session Management", () => {
		it("creates a session linked to user", async () => {
			const user = createMockUser();
			const session = createMockSession(user.id);

			// Create user first
			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, Date.now(), Date.now()]
			);

			// Create session
			await dbClient.run(
				`INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[session.id, user.id, session.token, session.expiresAt.getTime(), Date.now(), Date.now()]
			);

			const result = await dbClient.get<{ id: string; user_id: string; token: string }>(
				"SELECT id, user_id, token FROM session WHERE id = ?",
				[session.id]
			);

			expect(result).toBeDefined();
			expect(result?.user_id).toBe(user.id);
			expect(result?.token).toBe(session.token);
		});

		it("session expires_at is set correctly", async () => {
			const user = createMockUser();
			const session = createMockSession(user.id);

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, Date.now(), Date.now()]
			);

			await dbClient.run(
				`INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[session.id, user.id, session.token, session.expiresAt.getTime(), Date.now(), Date.now()]
			);

			const result = await dbClient.get<{ expires_at: number }>(
				"SELECT expires_at FROM session WHERE id = ?",
				[session.id]
			);

			expect(result).toBeDefined();
			// Verify expiration is in the future
			expect(result!.expires_at).toBeGreaterThan(Date.now());
		});

		it("session deletion works", async () => {
			const user = createMockUser();
			const session = createMockSession(user.id);

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, Date.now(), Date.now()]
			);

			await dbClient.run(
				`INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[session.id, user.id, session.token, session.expiresAt.getTime(), Date.now(), Date.now()]
			);

			// Delete the session
			await dbClient.run("DELETE FROM session WHERE id = ?", [session.id]);

			const result = await dbClient.get("SELECT id FROM session WHERE id = ?", [session.id]);

			expect(result).toBeNull();
		});

		it("session foreign key cascades on user delete", async () => {
			const user = createMockUser();
			const session = createMockSession(user.id);

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, Date.now(), Date.now()]
			);

			await dbClient.run(
				`INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[session.id, user.id, session.token, session.expiresAt.getTime(), Date.now(), Date.now()]
			);

			// Enable foreign keys and delete user
			await dbClient.run("PRAGMA foreign_keys = ON");
			await dbClient.run("DELETE FROM user WHERE id = ?", [user.id]);

			// Session should be deleted due to ON DELETE CASCADE
			const result = await dbClient.get("SELECT id FROM session WHERE id = ?", [session.id]);

			expect(result).toBeNull();
		});
	});

	// ============================================
	// OAuth Account Tests
	// ============================================

	describe("OAuth Account Linking", () => {
		it("creates account linked to user", async () => {
			const user = createMockUser();
			const accountId = `account-${Date.now()}`;

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, Date.now(), Date.now()]
			);

			await dbClient.run(
				`INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[accountId, "google-123", "google", user.id, Date.now(), Date.now()]
			);

			const result = await dbClient.get<{ id: string; provider_id: string; user_id: string }>(
				"SELECT id, provider_id, user_id FROM account WHERE id = ?",
				[accountId]
			);

			expect(result).toBeDefined();
			expect(result?.provider_id).toBe("google");
			expect(result?.user_id).toBe(user.id);
		});

		it("stores OAuth tokens", async () => {
			const user = createMockUser();
			const accountId = `account-${Date.now()}`;
			const accessToken = "access-token-123";
			const refreshToken = "refresh-token-456";

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, Date.now(), Date.now()]
			);

			await dbClient.run(
				`INSERT INTO account (id, account_id, provider_id, user_id, access_token, refresh_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					accountId,
					"google-123",
					"google",
					user.id,
					accessToken,
					refreshToken,
					Date.now(),
					Date.now(),
				]
			);

			const result = await dbClient.get<{ access_token: string; refresh_token: string }>(
				"SELECT access_token, refresh_token FROM account WHERE id = ?",
				[accountId]
			);

			expect(result?.access_token).toBe(accessToken);
			expect(result?.refresh_token).toBe(refreshToken);
		});
	});

	// ============================================
	// Two-Factor Authentication Tests
	// ============================================

	describe("Two-Factor Authentication", () => {
		it("creates two_factor entry for user", async () => {
			const user = createMockUser();
			const twoFactorId = `2fa-${Date.now()}`;
			const secret = "JBSWY3DPEHPK3PXP"; // Example TOTP secret

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, 1, Date.now(), Date.now()]
			);

			await dbClient.run(
				`INSERT INTO two_factor (id, user_id, secret, backup_codes)
         VALUES (?, ?, ?, ?)`,
				[twoFactorId, user.id, secret, JSON.stringify(["code1", "code2", "code3"])]
			);

			const result = await dbClient.get<{ id: string; secret: string; backup_codes: string }>(
				"SELECT id, secret, backup_codes FROM two_factor WHERE user_id = ?",
				[user.id]
			);

			expect(result).toBeDefined();
			expect(result?.secret).toBe(secret);
			expect(JSON.parse(result!.backup_codes)).toEqual(["code1", "code2", "code3"]);
		});

		it("two_factor cascades on user delete", async () => {
			const user = createMockUser();
			const twoFactorId = `2fa-${Date.now()}`;

			await dbClient.run(
				`INSERT INTO user (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[user.id, user.name, user.email, 1, 1, Date.now(), Date.now()]
			);

			await dbClient.run(
				`INSERT INTO two_factor (id, user_id, secret, backup_codes)
         VALUES (?, ?, ?, ?)`,
				[twoFactorId, user.id, "secret", "[]"]
			);

			// Enable foreign keys and delete user
			await dbClient.run("PRAGMA foreign_keys = ON");
			await dbClient.run("DELETE FROM user WHERE id = ?", [user.id]);

			const result = await dbClient.get("SELECT id FROM two_factor WHERE id = ?", [twoFactorId]);

			expect(result).toBeNull();
		});
	});

	// ============================================
	// Verification Token Tests
	// ============================================

	describe("Verification Tokens", () => {
		it("creates verification token", async () => {
			const verificationId = `verify-${Date.now()}`;
			const identifier = "test@example.com";
			const token = "verification-token-123";
			const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

			await dbClient.run(
				`INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[verificationId, identifier, token, expiresAt, Date.now(), Date.now()]
			);

			const result = await dbClient.get<{ id: string; identifier: string; value: string }>(
				"SELECT id, identifier, value FROM verification WHERE id = ?",
				[verificationId]
			);

			expect(result).toBeDefined();
			expect(result?.identifier).toBe(identifier);
			expect(result?.value).toBe(token);
		});

		it("can query verification by identifier", async () => {
			const identifier = `email-${Date.now()}@example.com`;
			const token = "token-123";

			await dbClient.run(
				`INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
				[`verify-${Date.now()}`, identifier, token, Date.now() + 3600000, Date.now(), Date.now()]
			);

			const result = await dbClient.get<{ value: string }>(
				"SELECT value FROM verification WHERE identifier = ?",
				[identifier]
			);

			expect(result?.value).toBe(token);
		});
	});
});
