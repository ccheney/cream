/**
 * Test Setup - Preloaded before all tests
 *
 * Sets required environment variables for modules that need them at load time.
 */

// Set LLM env vars required by @cream/mastra agents
Bun.env.LLM_PROVIDER = Bun.env.LLM_PROVIDER ?? "test-provider";
Bun.env.LLM_MODEL_ID = Bun.env.LLM_MODEL_ID ?? "test-model";
