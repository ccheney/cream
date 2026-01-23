/**
 * Trading Cycle Workflow Steps
 *
 * Individual step implementations for the OODA trading cycle workflow.
 * Each step is a Mastra workflow step with input/output schemas.
 *
 * Steps to be migrated:
 * - observe: Fetch market snapshot
 * - orient: Load memory and compute regimes
 * - grounding: Run grounding agent for real-time context
 * - analysts: Run news and fundamentals analysts
 * - debate: Run bullish/bearish researchers
 * - trader: Synthesize decision plan
 * - consensus: Risk manager and critic approval
 * - act: Execute approved decisions
 */

export { analystsStep } from "./analysts.js";
export { consensusStep } from "./consensus.js";
export { debateStep } from "./debate.js";
export { groundingStep } from "./grounding.js";
export { observeStep } from "./observe.js";
export { orientStep } from "./orient.js";
export { traderStep } from "./trader.js";
