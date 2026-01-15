/**
 * Root-level preload script for test environment setup
 *
 * Sets environment variables before any modules are loaded.
 * Required because some libraries (e.g., better-auth) cache environment
 * values at module load time.
 */
Bun.env.NODE_ENV = "test";
Bun.env.CREAM_ENV = Bun.env.CREAM_ENV || "BACKTEST";

// Set a dummy secret for better-auth so it doesn't throw during imports
// The actual auth is mocked in tests
Bun.env.BETTER_AUTH_SECRET =
	Bun.env.BETTER_AUTH_SECRET || "test-secret-for-development-only-not-for-production";
