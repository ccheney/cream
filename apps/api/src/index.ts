/**
 * @cream/api - Trading System API
 *
 * Exports the trading workflow, agents, and gRPC client.
 * In Phase 4, this provides the workflow skeleton with stub agents.
 * HTTP server integration (via Hono/Express adapters) will be added later.
 */

// Export agents
export * from "./agents/index.js";
// Export gRPC client
export * from "./grpc/index.js";
// Export the Mastra configuration
export { agents, mastra, tradingCycleWorkflow } from "./mastra/index.js";
// Export workflows
export * from "./workflows/index.js";
