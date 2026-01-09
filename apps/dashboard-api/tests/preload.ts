// Preload script to set environment variables before any modules are loaded
// This is necessary because better-auth caches NODE_ENV at module load time
process.env.NODE_ENV = "test";
process.env.CREAM_ENV = process.env.CREAM_ENV || "BACKTEST";
// Set a dummy secret for better-auth so it doesn't throw
// The actual auth is mocked in tests
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || "test-secret-for-development-only-not-for-production";
