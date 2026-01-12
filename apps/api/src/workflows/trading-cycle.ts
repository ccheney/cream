/**
 * Trading Cycle Workflow
 *
 * Implements the hourly OODA loop:
 * - Observe: Fetch market snapshot
 * - Orient: Load memory context
 * - Decide: Run agents and generate plan
 * - Act: Submit orders via Rust execution engine
 *
 * Mode selection:
 * - BACKTEST: Uses stub agents (no LLM calls)
 * - PAPER/LIVE: Uses real Mastra agents with Gemini LLM
 *
 * @see docs/plans/05-agents.md
 */

import { isBacktest } from "@cream/domain";
import type { TradeDecision } from "@cream/helix-schema";
import {
  ConsensusGate,
  type DecisionPlan,
  getPortfolioState,
  type PortfolioStateResponse,
  runConsensusLoop,
  withAgentTimeout,
} from "@cream/mastra-kit";
import type { CreateDecisionInput } from "@cream/storage";
import type { TradeDecisionInput } from "../../workflows/steps/helixMemoryUpdate.js";
import {
  type AgentConfigEntry,
  type AgentContext,
  type AgentStreamChunk,
  type BearishResearchOutput,
  type BullishResearchOutput,
  type FundamentalsAnalysisOutput,
  type OnStreamChunk,
  revisePlan,
  runAnalystsParallel,
  runAnalystsParallelStreaming,
  runApprovalParallel,
  runApprovalParallelStreaming,
  runDebateParallel,
  runDebateParallelStreaming,
  runTrader,
  runTraderStreaming,
  type SentimentAnalysisOutput,
} from "../agents/mastra-agents.js";
import { getDecisionsRepo, getThesisStateRepo } from "../db.js";

import {
  type AgentStatusEvent,
  buildAgentConfigs,
  checkConstraints,
  checkIndicatorTrigger,
  checkResearchTriggersAndSpawnIdea,
  computeAndStoreRegimes,
  DEFAULT_AGENT_TIMEOUT_MS,
  DEFAULT_MAX_CONSENSUS_ITERATIONS,
  DEFAULT_TOTAL_CONSENSUS_TIMEOUT_MS,
  fetchMarketSnapshot,
  getEmbeddingClient,
  getHelixOrchestrator,
  ingestClosedThesesForCycle,
  loadMemoryContext,
  loadRuntimeConfig,
  log,
  processThesisForDecision,
  runBearishResearcherStub,
  runBullishResearcherStub,
  runCriticStub,
  runFundamentalsAnalystStub,
  runNewsAnalystStub,
  runRiskManagerStub,
  runTraderAgentStub,
  submitOrders,
  type ThesisUpdate,
  type WorkflowInput,
  type WorkflowResult,
} from "./steps/trading-cycle/index.js";

// Re-export types for external consumers
export type {
  AgentStatusEvent,
  Approval,
  CandleData,
  Decision,
  ExternalContext,
  FundamentalsAnalysis,
  IndicatorTriggerResult,
  MarketSnapshot,
  MemoryContext,
  PredictionMarketSignals,
  QuoteData,
  RegimeData,
  Research,
  ResearchTriggerResult,
  SentimentAnalysis,
  ThesisUpdate,
  WorkflowDecisionPlan,
  WorkflowInput,
  WorkflowResult,
  WorkflowState,
} from "./steps/trading-cycle/index.js";

// ============================================
// Stub Mode Execution
// ============================================

async function executeTradingCycleStub(input: WorkflowInput): Promise<WorkflowResult> {
  const {
    cycleId,
    context,
    instruments = ["AAPL", "MSFT", "GOOGL"],
    useDraftConfig = false,
  } = input;

  const runtimeConfig = await loadRuntimeConfig(context, useDraftConfig);
  const configVersion = runtimeConfig?.trading.id ?? null;

  const marketSnapshot = await fetchMarketSnapshot(instruments, context);
  const _memoryContext = await loadMemoryContext(marketSnapshot, context);

  const [_sentimentAnalysis, _fundamentalsAnalysis] = await Promise.all([
    runNewsAnalystStub(instruments),
    runFundamentalsAnalystStub(instruments),
  ]);

  const [bullishResearch, bearishResearch] = await Promise.all([
    runBullishResearcherStub(instruments),
    runBearishResearcherStub(instruments),
  ]);

  const decisionPlan = await runTraderAgentStub(cycleId, bullishResearch, bearishResearch);

  const [riskApproval, criticApproval] = await Promise.all([
    runRiskManagerStub(decisionPlan),
    runCriticStub(decisionPlan),
  ]);

  const approved = riskApproval.verdict === "APPROVE" && criticApproval.verdict === "APPROVE";

  const constraintCheck = await checkConstraints(approved, decisionPlan, context);
  const orderSubmission = await submitOrders(
    constraintCheck.passed,
    decisionPlan,
    cycleId,
    context
  );

  return {
    cycleId,
    approved,
    iterations: 1,
    orderSubmission,
    mode: "STUB",
    configVersion,
  };
}

// ============================================
// LLM Mode Execution (Real Mastra Agents)
// ============================================

async function executeTradingCycleLLM(input: WorkflowInput): Promise<WorkflowResult> {
  const {
    cycleId,
    context,
    instruments = ["AAPL", "MSFT", "GOOGL"],
    externalContext,
    useDraftConfig = false,
    onAgentEvent,
    onStreamChunk,
  } = input;

  function emitAgentEvent(
    agentType: AgentStatusEvent["agentType"],
    status: AgentStatusEvent["status"],
    options?: { output?: string; error?: string; durationMs?: number }
  ): void {
    if (onAgentEvent) {
      onAgentEvent({
        cycleId,
        agentType,
        status,
        output: options?.output,
        error: options?.error,
        durationMs: options?.durationMs,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const useStreaming = Boolean(onStreamChunk);

  const streamChunkHandler: OnStreamChunk = (chunk: AgentStreamChunk) => {
    if (onStreamChunk) {
      onStreamChunk(chunk);
    }
  };

  log.info(
    {
      cycleId,
      environment: context.environment,
      instruments,
      useDraftConfig,
    },
    "Starting LLM trading cycle"
  );

  const runtimeConfig = await loadRuntimeConfig(context, useDraftConfig);
  const configVersion = runtimeConfig?.trading.id ?? null;

  const agentTimeoutMs = runtimeConfig?.trading.agentTimeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const totalConsensusTimeoutMs =
    runtimeConfig?.trading.totalConsensusTimeoutMs ?? DEFAULT_TOTAL_CONSENSUS_TIMEOUT_MS;
  const maxConsensusIterations =
    runtimeConfig?.trading.maxConsensusIterations ?? DEFAULT_MAX_CONSENSUS_ITERATIONS;

  const agentConfigs = buildAgentConfigs(runtimeConfig);

  const marketSnapshot = await fetchMarketSnapshot(instruments, context);

  const [memoryContext, regimeLabels] = await Promise.all([
    loadMemoryContext(marketSnapshot, context),
    computeAndStoreRegimes(marketSnapshot),
  ]);

  const researchTriggerResult = await checkResearchTriggersAndSpawnIdea(
    regimeLabels,
    context.environment
  );
  if (researchTriggerResult.triggered) {
    log.info(
      {
        cycleId,
        triggerType: researchTriggerResult.trigger?.type,
        severity: researchTriggerResult.trigger?.severity,
      },
      "Research trigger activated - hypothesis generation may be pending"
    );
  }

  // Check for indicator synthesis triggers
  const indicatorTriggerResult = await checkIndicatorTrigger(regimeLabels, context);
  if (indicatorTriggerResult?.shouldTrigger) {
    log.info(
      {
        cycleId,
        triggerReason: indicatorTriggerResult.triggerReason,
        currentRegime: indicatorTriggerResult.conditions.currentRegime,
        recommendation: indicatorTriggerResult.recommendation,
      },
      "Indicator synthesis trigger activated"
    );
  }

  const agentContext: AgentContext = {
    cycleId,
    symbols: instruments,
    snapshots: marketSnapshot.candles,
    indicators: marketSnapshot.indicators,
    memory: { relevantCases: memoryContext.relevantCases },
    externalContext: {
      news: externalContext?.news ?? [],
      macroIndicators: externalContext?.macroIndicators ?? {},
      sentiment: externalContext?.sentiment ?? {},
    },
    regimeLabels,
    predictionMarketSignals: externalContext?.predictionMarketSignals,
    agentConfigs,
  };

  // Phase 1: Analysts
  log.info({ cycleId, instruments, phase: "analysts" }, "Starting analyst phase");

  const analystStartTime = Date.now();
  emitAgentEvent("news_analyst", "running");
  emitAgentEvent("fundamentals_analyst", "running");

  const analystsResult = await withAgentTimeout(
    useStreaming
      ? runAnalystsParallelStreaming(agentContext, streamChunkHandler)
      : runAnalystsParallel(agentContext),
    agentTimeoutMs * 3,
    "analysts"
  );

  const analystDuration = Date.now() - analystStartTime;

  let analystOutputs: {
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  };

  if (analystsResult.timedOut) {
    log.warn({ cycleId, phase: "analysts" }, "Analyst agents timed out");
    emitAgentEvent("news_analyst", "error", { error: "Timed out", durationMs: analystDuration });
    emitAgentEvent("fundamentals_analyst", "error", {
      error: "Timed out",
      durationMs: analystDuration,
    });
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: { submitted: false, orderIds: [], errors: ["Analyst agents timed out"] },
      mode: "LLM",
      configVersion,
    };
  }

  if (analystsResult.errored) {
    log.error({ cycleId, phase: "analysts", error: analystsResult.error }, "Analyst agents failed");
    emitAgentEvent("news_analyst", "error", {
      error: analystsResult.error,
      durationMs: analystDuration,
    });
    emitAgentEvent("fundamentals_analyst", "error", {
      error: analystsResult.error,
      durationMs: analystDuration,
    });
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: {
        submitted: false,
        orderIds: [],
        errors: [`Analyst agents failed: ${analystsResult.error}`],
      },
      mode: "LLM",
      configVersion,
    };
  }

  analystOutputs = analystsResult.result;

  if (!analystOutputs.news || !analystOutputs.fundamentals) {
    const missing = [
      !analystOutputs.news && "news",
      !analystOutputs.fundamentals && "fundamentals",
    ].filter(Boolean);
    log.error({ cycleId, phase: "analysts", missing }, "Analyst agents returned undefined outputs");
    emitAgentEvent("news_analyst", "error", {
      error: !analystOutputs.news ? "Returned undefined" : undefined,
      durationMs: analystDuration,
    });
    emitAgentEvent("fundamentals_analyst", "error", {
      error: !analystOutputs.fundamentals ? "Returned undefined" : undefined,
      durationMs: analystDuration,
    });
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: {
        submitted: false,
        orderIds: [],
        errors: [`Analyst agents returned undefined outputs: ${missing.join(", ")}`],
      },
      mode: "LLM",
      configVersion,
    };
  }

  emitAgentEvent("news_analyst", "complete", { durationMs: analystDuration });
  emitAgentEvent("fundamentals_analyst", "complete", { durationMs: analystDuration });

  log.info(
    {
      cycleId,
      phase: "analysts",
      newsCount: analystOutputs.news.length,
      fundamentalsCount: analystOutputs.fundamentals.length,
    },
    "Analyst phase complete"
  );

  // Phase 2: Debate
  log.info({ cycleId, phase: "debate" }, "Starting debate phase");

  const debateStartTime = Date.now();
  emitAgentEvent("bullish_researcher", "running");
  emitAgentEvent("bearish_researcher", "running");

  const debateResult = await withAgentTimeout(
    useStreaming
      ? runDebateParallelStreaming(agentContext, analystOutputs, streamChunkHandler)
      : runDebateParallel(agentContext, analystOutputs),
    agentTimeoutMs * 2,
    "debate"
  );

  const debateDuration = Date.now() - debateStartTime;

  let debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  };

  if (debateResult.timedOut) {
    log.warn({ cycleId, phase: "debate" }, "Research agents timed out");
    emitAgentEvent("bullish_researcher", "error", {
      error: "Timed out",
      durationMs: debateDuration,
    });
    emitAgentEvent("bearish_researcher", "error", {
      error: "Timed out",
      durationMs: debateDuration,
    });
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: { submitted: false, orderIds: [], errors: ["Research agents timed out"] },
      mode: "LLM",
      configVersion,
    };
  }

  if (debateResult.errored) {
    log.error({ cycleId, phase: "debate", error: debateResult.error }, "Research agents failed");
    emitAgentEvent("bullish_researcher", "error", {
      error: debateResult.error,
      durationMs: debateDuration,
    });
    emitAgentEvent("bearish_researcher", "error", {
      error: debateResult.error,
      durationMs: debateDuration,
    });
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: {
        submitted: false,
        orderIds: [],
        errors: [`Research agents failed: ${debateResult.error}`],
      },
      mode: "LLM",
      configVersion,
    };
  }

  debateOutputs = debateResult.result;

  if (!debateOutputs.bullish || !debateOutputs.bearish) {
    const missing = [
      !debateOutputs.bullish && "bullish",
      !debateOutputs.bearish && "bearish",
    ].filter(Boolean);
    log.error({ cycleId, phase: "debate", missing }, "Research agents returned undefined outputs");
    emitAgentEvent("bullish_researcher", "error", {
      error: !debateOutputs.bullish ? "Returned undefined" : undefined,
      durationMs: debateDuration,
    });
    emitAgentEvent("bearish_researcher", "error", {
      error: !debateOutputs.bearish ? "Returned undefined" : undefined,
      durationMs: debateDuration,
    });
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: {
        submitted: false,
        orderIds: [],
        errors: [`Research agents returned undefined outputs: ${missing.join(", ")}`],
      },
      mode: "LLM",
      configVersion,
    };
  }

  emitAgentEvent("bullish_researcher", "complete", { durationMs: debateDuration });
  emitAgentEvent("bearish_researcher", "complete", { durationMs: debateDuration });

  log.info(
    {
      cycleId,
      phase: "debate",
      bullishCount: debateOutputs.bullish.length,
      bearishCount: debateOutputs.bearish.length,
    },
    "Debate phase complete"
  );

  // Phase 3: Trader
  log.info({ cycleId, phase: "trader" }, "Starting trader phase");

  let portfolioState: PortfolioStateResponse | undefined;
  if (!isBacktest(context)) {
    try {
      portfolioState = await getPortfolioState(context);
      log.info(
        {
          cycleId,
          phase: "trader",
          positionCount: portfolioState.positions.length,
          buyingPower: portfolioState.buyingPower,
        },
        "Fetched portfolio state for trader"
      );
    } catch (error) {
      log.warn(
        { cycleId, phase: "trader", error: error instanceof Error ? error.message : String(error) },
        "Failed to fetch portfolio state, continuing without position context"
      );
    }
  }

  const traderStartTime = Date.now();
  emitAgentEvent("trader", "running");

  const portfolioStateRecord = portfolioState as Record<string, unknown> | undefined;

  const traderResult = await withAgentTimeout(
    useStreaming
      ? runTraderStreaming(agentContext, debateOutputs, streamChunkHandler, portfolioStateRecord)
      : runTrader(agentContext, debateOutputs, portfolioStateRecord),
    agentTimeoutMs,
    "trader"
  );

  const traderDuration = Date.now() - traderStartTime;

  if (traderResult.timedOut) {
    log.warn({ cycleId, phase: "trader" }, "Trader agent timed out");
    emitAgentEvent("trader", "error", { error: "Timed out", durationMs: traderDuration });
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: { submitted: false, orderIds: [], errors: ["Trader agent timed out"] },
      mode: "LLM",
      configVersion,
    };
  }

  if (traderResult.errored) {
    log.error({ cycleId, phase: "trader", error: traderResult.error }, "Trader agent failed");
    emitAgentEvent("trader", "error", { error: traderResult.error, durationMs: traderDuration });
    return {
      cycleId,
      approved: false,
      iterations: 0,
      orderSubmission: {
        submitted: false,
        orderIds: [],
        errors: [`Trader agent failed: ${traderResult.error}`],
      },
      mode: "LLM",
      configVersion,
    };
  }

  const initialPlan = traderResult.result;
  emitAgentEvent("trader", "complete", { durationMs: traderDuration });

  log.info(
    {
      cycleId,
      phase: "trader",
      decisionCount: initialPlan.decisions.length,
      decisions: initialPlan.decisions.map((d) => ({
        symbol: d.instrumentId,
        action: d.action,
        direction: d.direction,
        size: d.size,
      })),
    },
    "Trader phase complete"
  );

  // Phase 4: Consensus Loop
  log.info(
    { cycleId, phase: "consensus", maxIterations: maxConsensusIterations },
    "Starting consensus phase"
  );

  const consensusStartTime = Date.now();
  emitAgentEvent("risk_manager", "running");
  emitAgentEvent("critic", "running");

  const gate = new ConsensusGate({
    maxIterations: maxConsensusIterations,
    logRejections: true,
    timeout: {
      perAgentMs: agentTimeoutMs,
      totalMs: totalConsensusTimeoutMs,
    },
    escalation: {
      enabled: !isBacktest(input.context),
    },
  });

  const consensusResult = await runConsensusLoop(
    gate,
    initialPlan,
    async (plan: DecisionPlan) => {
      const result = useStreaming
        ? await runApprovalParallelStreaming(
            plan,
            analystOutputs,
            debateOutputs,
            streamChunkHandler,
            portfolioStateRecord,
            undefined,
            undefined,
            agentConfigs as Record<string, AgentConfigEntry>
          )
        : await runApprovalParallel(
            plan,
            analystOutputs,
            debateOutputs,
            portfolioStateRecord,
            undefined,
            undefined,
            agentConfigs as Record<string, AgentConfigEntry>
          );
      return result;
    },
    async (plan: DecisionPlan, rejectionReasons: string[]) => {
      return revisePlan(
        plan,
        rejectionReasons,
        analystOutputs,
        debateOutputs,
        agentConfigs as Record<string, AgentConfigEntry>
      );
    }
  );

  const consensusDuration = Date.now() - consensusStartTime;

  emitAgentEvent("risk_manager", "complete", { durationMs: consensusDuration });
  emitAgentEvent("critic", "complete", { durationMs: consensusDuration });

  log.info(
    {
      cycleId,
      phase: "consensus",
      approved: consensusResult.approved,
      iterations: consensusResult.iterations,
      finalDecisionCount: consensusResult.plan.decisions.length,
    },
    "Consensus phase complete"
  );

  // Persist Decisions
  log.info(
    { cycleId, decisionCount: consensusResult.plan.decisions.length },
    "Persisting decisions to database"
  );

  try {
    const decisionsRepo = await getDecisionsRepo();
    const persistedDecisions: string[] = [];

    for (const decision of consensusResult.plan.decisions) {
      const decisionInput: CreateDecisionInput = {
        id: decision.decisionId,
        cycleId,
        symbol: decision.instrumentId,
        action: decision.action as "BUY" | "SELL" | "HOLD" | "CLOSE",
        direction: decision.direction as "LONG" | "SHORT" | "FLAT",
        size: decision.size.value,
        sizeUnit: decision.size.unit,
        entryPrice: null,
        stopPrice: decision.stopLoss?.price ?? null,
        targetPrice: decision.takeProfit?.price ?? null,
        status: consensusResult.approved ? "approved" : "rejected",
        strategyFamily: decision.strategyFamily ?? null,
        timeHorizon: decision.timeHorizon ?? null,
        rationale: decision.rationale?.summary ?? null,
        bullishFactors: decision.rationale?.bullishFactors ?? [],
        bearishFactors: decision.rationale?.bearishFactors ?? [],
        confidenceScore: null,
        riskScore: null,
        metadata: {
          consensusIterations: consensusResult.iterations,
          configVersion,
          decisionLogic: decision.rationale?.decisionLogic ?? null,
          memoryReferences: decision.rationale?.memoryReferences ?? [],
        },
        environment: context.environment,
      };

      await decisionsRepo.create(decisionInput);
      persistedDecisions.push(decision.decisionId);
    }

    log.info(
      { cycleId, persistedCount: persistedDecisions.length, decisionIds: persistedDecisions },
      "Decisions persisted successfully"
    );
  } catch (error) {
    log.error(
      { cycleId, error: error instanceof Error ? error.message : String(error) },
      "Failed to persist decisions"
    );
  }

  // Thesis Lifecycle Management
  const thesisUpdates: ThesisUpdate[] = [];
  if (consensusResult.approved) {
    try {
      const thesisRepo = await getThesisStateRepo();

      for (const decision of consensusResult.plan.decisions) {
        const candleData = marketSnapshot.candles[decision.instrumentId];
        const currentPrice =
          candleData && candleData.length > 0
            ? candleData[candleData.length - 1]?.close
            : undefined;
        const update = await processThesisForDecision(
          thesisRepo,
          {
            instrumentId: decision.instrumentId,
            action: decision.action,
            direction: decision.direction,
            stopLoss: decision.stopLoss?.price,
            takeProfit: decision.takeProfit?.price,
            rationale: decision.rationale,
          },
          context.environment,
          cycleId,
          currentPrice
        );
        if (update) {
          thesisUpdates.push(update);
        }
      }

      if (thesisUpdates.length > 0) {
        log.info(
          {
            cycleId,
            thesisCount: thesisUpdates.length,
            updates: thesisUpdates.map((u) => ({
              thesisId: u.thesisId,
              action: u.action,
              fromState: u.fromState,
              toState: u.toState,
            })),
          },
          "Thesis lifecycle updates processed"
        );
      }
    } catch (error) {
      log.error(
        { cycleId, error: error instanceof Error ? error.message : String(error) },
        "Failed to process thesis lifecycle"
      );
    }
  }

  // Update HelixDB Memory
  const orchestrator = getHelixOrchestrator();
  const embedder = getEmbeddingClient();

  if (orchestrator && embedder && consensusResult.approved) {
    log.info(
      { cycleId, decisionCount: consensusResult.plan.decisions.length },
      "Updating HelixDB memory"
    );

    try {
      function mapAction(action: string): "BUY" | "SELL" | "HOLD" | "NO_TRADE" {
        switch (action) {
          case "BUY":
            return "BUY";
          case "SELL":
          case "CLOSE":
            return "SELL";
          case "HOLD":
            return "HOLD";
          default:
            return "NO_TRADE";
        }
      }

      const tradeDecisionInputs: TradeDecisionInput[] = await Promise.all(
        consensusResult.plan.decisions.map(async (decision) => {
          const rationaleText = decision.rationale?.summary ?? "";
          const embeddingResult = await embedder.generateEmbedding(rationaleText);

          const tradeDecision: TradeDecision = {
            decision_id: decision.decisionId,
            cycle_id: cycleId,
            instrument_id: decision.instrumentId,
            underlying_symbol: decision.instrumentId,
            regime_label: regimeLabels[decision.instrumentId]?.regime ?? "RANGE",
            action: mapAction(decision.action),
            decision_json: JSON.stringify({
              action: decision.action,
              direction: decision.direction,
              size: decision.size,
              stopLoss: decision.stopLoss,
              takeProfit: decision.takeProfit,
              strategyFamily: decision.strategyFamily,
              timeHorizon: decision.timeHorizon,
            }),
            rationale_text: rationaleText,
            snapshot_reference: `snapshot-${cycleId}`,
            created_at: new Date().toISOString(),
            environment: context.environment as "BACKTEST" | "PAPER" | "LIVE",
          };

          return {
            decision: tradeDecision,
            embedding: embeddingResult.values,
          };
        })
      );

      const actResult = await orchestrator.act({
        decisions: tradeDecisionInputs,
        lifecycleEvents: [],
        externalEvents: [],
        influenceEdges: [],
      });

      log.info(
        {
          cycleId,
          success: actResult.success,
          usedFallback: actResult.usedFallback,
          executionMs: actResult.executionMs,
          exceededTarget: actResult.exceededTarget,
          decisionsProcessed: actResult.data?.decisions.totalProcessed ?? 0,
        },
        "HelixDB memory update completed"
      );
    } catch (error) {
      log.warn(
        { cycleId, error: error instanceof Error ? error.message : String(error) },
        "Failed to update HelixDB memory - continuing with trading cycle"
      );
    }
  }

  // Act Phase
  log.info({ cycleId, phase: "act", approved: consensusResult.approved }, "Starting act phase");

  const constraintCheck = await checkConstraints(
    consensusResult.approved,
    consensusResult.plan,
    context
  );
  const orderSubmission = await submitOrders(
    constraintCheck.passed,
    consensusResult.plan,
    cycleId,
    context
  );

  // Thesis Memory Ingestion
  let thesisMemoryIngestion: { ingested: number; errors: string[] } | undefined;
  if (thesisUpdates.length > 0) {
    thesisMemoryIngestion = await ingestClosedThesesForCycle(
      cycleId,
      context.environment,
      thesisUpdates
    );
  }

  log.info(
    {
      cycleId,
      approved: consensusResult.approved,
      iterations: consensusResult.iterations,
      ordersSubmitted: orderSubmission.submitted,
      orderIds: orderSubmission.orderIds,
      errors: orderSubmission.errors,
      thesisUpdatesCount: thesisUpdates.length,
      researchTriggered: researchTriggerResult.triggered,
      indicatorTriggerActivated: indicatorTriggerResult?.shouldTrigger ?? false,
      thesisMemoryIngested: thesisMemoryIngestion?.ingested ?? 0,
    },
    "Trading cycle complete"
  );

  return {
    cycleId,
    approved: consensusResult.approved,
    iterations: consensusResult.iterations,
    orderSubmission,
    mode: "LLM",
    configVersion,
    thesisUpdates: thesisUpdates.length > 0 ? thesisUpdates : undefined,
    researchTrigger: researchTriggerResult.triggered ? researchTriggerResult : undefined,
    indicatorTrigger: indicatorTriggerResult ?? undefined,
    thesisMemoryIngestion,
  };
}

// ============================================
// Main Workflow Execution
// ============================================

/**
 * Execute the trading cycle workflow.
 *
 * Mode selection:
 * - BACKTEST: Uses stub agents (no LLM calls)
 * - PAPER/LIVE: Uses real Mastra agents with Gemini LLM
 *
 * @param input - Workflow input containing cycleId and optional instruments
 * @returns Workflow result with approval status and order submission details
 */
export async function executeTradingCycle(input: WorkflowInput): Promise<WorkflowResult> {
  const useStub = input.forceStub || isBacktest(input.context);

  if (useStub) {
    return executeTradingCycleStub(input);
  }

  return executeTradingCycleLLM(input);
}

/**
 * Workflow object for Mastra-like interface.
 */
export const tradingCycleWorkflow = {
  id: "trading-cycle-workflow",
  description: "Hourly OODA loop for trading decisions",

  async execute(options: { triggerData: WorkflowInput }): Promise<WorkflowResult> {
    return executeTradingCycle(options.triggerData);
  },
};
