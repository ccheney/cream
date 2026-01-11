/**
 * Run Consensus Step
 *
 * Step 8: Risk Manager and Critic approve/revise the DecisionPlan.
 * Part of the DECIDE phase in the OODA loop.
 *
 * Uses ConsensusGate for iterative approval:
 * - Risk Manager checks position limits, drawdown, correlation
 * - Critic checks for cognitive biases, logical consistency
 * - Trader revises plan if rejected (up to maxIterations)
 *
 * Mode selection:
 * - BACKTEST: Uses stub agents (auto-approve)
 * - PAPER/LIVE: Uses real Mastra agents with LLM
 */

import { createContext, type ExecutionContext, isBacktest, requireEnv } from "@cream/domain";
import { ConsensusGate, runConsensusLoop } from "@cream/mastra-kit";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import {
  type AgentConfigEntry,
  type AgentStreamChunk,
  type DecisionPlan,
  type OnStreamChunk,
  revisePlan,
  runApprovalParallel,
  runApprovalParallelStreaming,
} from "../agents/mastra-agents.js";
import { log } from "../logger.js";
import { RunAnalystsOutputSchema } from "./runAnalysts.js";
import { RunDebateOutputSchema } from "./runDebate.js";
import { SynthesizePlanOutputSchema } from "./synthesizePlan.js";

// ============================================
// Types
// ============================================

/**
 * Create ExecutionContext for step invocation.
 */
function createStepContext(): ExecutionContext {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Input/Output Schemas
// ============================================

export const RunConsensusInputSchema = z.object({
  cycleId: z.string(),
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
  agentConfigs: z.record(z.string(), z.any()).optional(),
  agentTimeoutMs: z.number().optional(),
  totalConsensusTimeoutMs: z.number().optional(),
  maxConsensusIterations: z.number().optional(),
  useStreaming: z.boolean().optional(),
  portfolioState: z.any().optional(),
  // Previous step outputs
  analystOutputs: RunAnalystsOutputSchema,
  debateOutputs: RunDebateOutputSchema,
  synthesizePlanOutput: SynthesizePlanOutputSchema,
});

const ApprovalSchema = z.object({
  verdict: z.enum(["APPROVE", "REJECT"]),
  violations: z.array(z.any()).optional(),
  required_changes: z.array(z.any()).optional(),
  notes: z.string().optional(),
});

export const RunConsensusOutputSchema = z.object({
  approved: z.boolean(),
  plan: z.any(), // DecisionPlan after potential revisions
  iterations: z.number(),
  riskApproval: ApprovalSchema.optional(),
  criticApproval: ApprovalSchema.optional(),
  escalated: z.boolean(),
  rejectionReasons: z.array(z.string()),
  durationMs: z.number(),
  mode: z.enum(["STUB", "LLM"]),
});

export type RunConsensusInput = z.infer<typeof RunConsensusInputSchema>;
export type RunConsensusOutput = z.infer<typeof RunConsensusOutputSchema>;

// ============================================
// Default Timeouts
// ============================================

const DEFAULT_AGENT_TIMEOUT_MS = 1_800_000; // 30 minutes per agent
const DEFAULT_TOTAL_CONSENSUS_TIMEOUT_MS = 300_000; // 5 minutes total
const DEFAULT_MAX_CONSENSUS_ITERATIONS = 3;

// ============================================
// Stub Implementations (for BACKTEST mode)
// ============================================

interface Approval {
  verdict: "APPROVE" | "REJECT";
  violations?: unknown[];
  required_changes?: unknown[];
  notes?: string;
}

async function runRiskManagerStub(_plan: DecisionPlan): Promise<Approval> {
  return {
    verdict: "APPROVE",
    violations: [],
    required_changes: [],
    notes: "HOLD decisions carry no new risk.",
  };
}

async function runCriticStub(_plan: DecisionPlan): Promise<Approval> {
  return {
    verdict: "APPROVE",
    violations: [],
    required_changes: [],
    notes: "Plan is logically consistent.",
  };
}

// ============================================
// Step Implementation
// ============================================

export const runConsensusStep = createStep({
  id: "run-consensus",
  description: "Risk Manager and Critic approve/revise the DecisionPlan",
  inputSchema: RunConsensusInputSchema,
  outputSchema: RunConsensusOutputSchema,
  retries: 1, // Consensus is already iterative, don't retry
  execute: async ({ inputData }) => {
    const {
      cycleId,
      environment,
      agentConfigs,
      agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
      totalConsensusTimeoutMs = DEFAULT_TOTAL_CONSENSUS_TIMEOUT_MS,
      maxConsensusIterations = DEFAULT_MAX_CONSENSUS_ITERATIONS,
      useStreaming = false,
      portfolioState,
      analystOutputs,
      debateOutputs,
      synthesizePlanOutput,
    } = inputData;

    const ctx = createStepContext();
    const startTime = Date.now();

    const initialPlan = synthesizePlanOutput.plan as DecisionPlan;

    // In BACKTEST mode, use stub implementations (auto-approve)
    if (isBacktest(ctx)) {
      log.debug({ cycleId, phase: "consensus", mode: "STUB" }, "Running consensus stubs");

      const [riskApproval, criticApproval] = await Promise.all([
        runRiskManagerStub(initialPlan),
        runCriticStub(initialPlan),
      ]);

      const approved = riskApproval.verdict === "APPROVE" && criticApproval.verdict === "APPROVE";

      return {
        approved,
        plan: initialPlan,
        iterations: 1,
        riskApproval,
        criticApproval,
        escalated: false,
        rejectionReasons: [],
        durationMs: Date.now() - startTime,
        mode: "STUB" as const,
      };
    }

    // In PAPER/LIVE mode, use real Mastra agents with consensus loop
    log.info(
      { cycleId, phase: "consensus", maxIterations: maxConsensusIterations },
      "Starting consensus phase"
    );

    // Stream handler (no-op if not streaming)
    const streamChunkHandler: OnStreamChunk = (_chunk: AgentStreamChunk) => {
      // Streaming is handled at the workflow level via writer
    };

    // Build agent configs for approval agents
    const typedAgentConfigs = agentConfigs as Record<string, AgentConfigEntry> | undefined;

    // Create consensus gate
    const gate = new ConsensusGate({
      maxIterations: maxConsensusIterations,
      logRejections: true,
      timeout: {
        perAgentMs: agentTimeoutMs,
        totalMs: totalConsensusTimeoutMs,
      },
      escalation: {
        enabled: environment !== "BACKTEST",
      },
    });

    // Run consensus loop
    const consensusResult = await runConsensusLoop(
      gate,
      initialPlan,
      // getApproval function
      async (plan: DecisionPlan) => {
        const result = useStreaming
          ? await runApprovalParallelStreaming(
              plan,
              analystOutputs,
              debateOutputs,
              streamChunkHandler,
              portfolioState as Record<string, unknown> | undefined,
              undefined, // constraints
              undefined, // factorZooContext
              typedAgentConfigs
            )
          : await runApprovalParallel(
              plan,
              analystOutputs,
              debateOutputs,
              portfolioState as Record<string, unknown> | undefined,
              undefined, // constraints
              undefined, // factorZooContext
              typedAgentConfigs
            );
        return result;
      },
      // revisePlan function
      async (plan: DecisionPlan, rejectionReasons: string[]) => {
        return revisePlan(plan, rejectionReasons, analystOutputs, debateOutputs, typedAgentConfigs);
      }
    );

    const durationMs = Date.now() - startTime;

    log.info(
      {
        cycleId,
        phase: "consensus",
        approved: consensusResult.approved,
        iterations: consensusResult.iterations,
        finalDecisionCount: consensusResult.plan.decisions.length,
        durationMs,
      },
      "Consensus phase complete"
    );

    return {
      approved: consensusResult.approved,
      plan: consensusResult.plan,
      iterations: consensusResult.iterations,
      riskApproval: consensusResult.riskApproval,
      criticApproval: consensusResult.criticApproval,
      escalated: consensusResult.escalated ?? false,
      rejectionReasons: consensusResult.rejectionReasons ?? [],
      durationMs,
      mode: "LLM" as const,
    };
  },
});

export default runConsensusStep;
