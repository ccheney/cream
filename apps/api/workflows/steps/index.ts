/**
 * Workflow Steps
 *
 * Individual steps that compose the trading cycle workflows.
 */

// HelixDB Memory Update
export {
  DEFAULT_BATCH_SIZE,
  DEFAULT_EMBEDDING_MODEL,
  executeHelixMemoryUpdate,
  type ExternalEventInput,
  type InfluenceEdgeInput,
  type MemoryUpdateInput,
  type MemoryUpdateResult,
  recordLifecycleEvents,
  type TradeDecisionInput,
  updateDecisionMemory,
  updateExternalEvents,
} from "./helixMemoryUpdate";

// HelixDB Retrieval (GraphRAG)
export {
  type DecisionSummary,
  DEFAULT_RETRIEVAL_CONFIG,
  executeHelixRetrieval,
  PERFORMANCE_TARGETS,
  type RetrievalInput,
  type RetrievalResult,
  retrieveRegimeDecisions,
  retrieveSimilarDecisions,
  retrieveVectorOnly,
} from "./helixRetrieval";
