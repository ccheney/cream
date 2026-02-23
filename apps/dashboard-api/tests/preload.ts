// Preload script to set environment variables before any modules are loaded
// This is necessary because better-auth caches NODE_ENV at module load time
Bun.env.NODE_ENV = "test";
Bun.env.CREAM_ENV = Bun.env.CREAM_ENV || "PAPER";
Bun.env.STREAM_PROXY_URL = Bun.env.STREAM_PROXY_URL || "http://127.0.0.1:50052";
Bun.env.WORKER_URL = Bun.env.WORKER_URL || "http://127.0.0.1:3002";
// Set a dummy secret for better-auth so it doesn't throw
// The actual auth is mocked in tests
Bun.env.BETTER_AUTH_SECRET =
	Bun.env.BETTER_AUTH_SECRET || "test-secret-for-development-only-not-for-production";
