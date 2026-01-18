/**
 * @cream/api - Trading System API
 *
 * Exports the trading workflow, agents, and gRPC client.
 */

// Export database utilities
export { getMacroWatchRepo } from "./db.js";
// Export gRPC client
export * from "./grpc/index.js";
// Export agents
export * from "./mastra/agents/index.js";
// Export the Mastra configuration
export { mastra, tradingCycleWorkflow } from "./mastra/index.js";
// Export workflows
export * from "./mastra/workflows/index.js";
