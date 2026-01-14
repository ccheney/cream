/**
 * @cream/api - Trading System API
 *
 * Exports the trading workflow, agents, and gRPC client.
 * In Phase 4, this provides the workflow skeleton with stub agents.
 * HTTP server integration (via Hono/Express adapters) will be added later.
 */

// Export gRPC client
export * from "./grpc/index.js";
// Export agents
export * from "./mastra/agents/index.js";
// Export the Mastra configuration
export { agents, mastra, tradingCycleWorkflow } from "./mastra/index.js";
// Export workflows
export * from "./mastra/workflows/index.js";
