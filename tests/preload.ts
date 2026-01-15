/**
 * Root-level preload script for test environment setup
 *
 * Sets environment variables before any modules are loaded.
 * Required because some libraries (e.g., better-auth) cache environment
 * values at module load time.
 */
process.env.NODE_ENV = "test";
process.env.CREAM_ENV = process.env.CREAM_ENV || "BACKTEST";

// Set a dummy secret for better-auth so it doesn't throw during imports
// The actual auth is mocked in tests
process.env.BETTER_AUTH_SECRET =
	process.env.BETTER_AUTH_SECRET || "test-secret-for-development-only-not-for-production";
