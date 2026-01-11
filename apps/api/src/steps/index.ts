/**
 * Workflow Steps
 *
 * Re-exports all step definitions for the trading cycle workflow.
 */

export * from "./buildSnapshot.js";
export * from "./fetchPredictionMarkets.js";
export * from "./gatherExternalContext.js";
// OBSERVE Phase
export * from "./loadState.js";
// ORIENT Phase
export * from "./retrieveMemory.js";
// WIP: checkResearchTriggers has type alignment issues
// export * from "./checkResearchTriggers.js";

// DECIDE Phase - WIP: These steps need type alignment with mastra-agents.ts
// export * from "./runAnalysts.js";
// export * from "./runDebate.js";
// export * from "./synthesizePlan.js";
// export * from "./runConsensus.js";

// ACT Phase
export * from "./executeOrders.js";
export * from "./ingestThesisMemory.js";
// WIP: persistDecisions has type alignment issues
// export * from "./persistDecisions.js";
export * from "./persistMemory.js";
