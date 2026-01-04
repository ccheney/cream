/**
 * Agent Tracing Infrastructure
 *
 * Captures execution traces using LangSmith SDK for debugging,
 * dataset creation, and production monitoring.
 *
 * @see docs/plans/14-testing.md lines 610-644
 */

import type { AgentType } from "./index.js";

// ============================================
// Types
// ============================================

/**
 * Agent interface for tracing.
 */
export interface TracedAgent {
  /** Agent name */
  name: AgentType;

  /** Agent version */
  version: string;

  /** Run the agent */
  run: <T>(input: AgentInput) => Promise<T>;
}

/**
 * Input to an agent.
 */
export interface AgentInput {
  /** Snapshot ID */
  snapshotId: string;

  /** Additional input data */
  [key: string]: unknown;
}

/**
 * Agent output with common fields.
 */
export interface AgentOutput {
  /** Decisions made */
  decisions?: unknown[];

  /** Verdict (for risk/critic) */
  verdict?: "APPROVE" | "REJECT";

  /** Confidence score */
  confidence?: number;

  /** Additional output data */
  [key: string]: unknown;
}

/**
 * Trace metadata.
 */
export interface TraceMetadata {
  /** Unique run identifier */
  runId: string;

  /** Trading cycle identifier */
  cycleId: string;

  /** Environment */
  environment?: "BACKTEST" | "PAPER" | "LIVE";

  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Span interface for trace operations.
 */
export interface Span {
  /** Set span attributes */
  setAttributes: (attributes: Record<string, unknown>) => void;

  /** Set span status */
  setStatus: (status: "OK" | "ERROR") => void;

  /** Record error */
  recordError: (error: Error) => void;

  /** End the span */
  end: () => void;

  /** Get span ID */
  spanId: string;

  /** Get trace ID */
  traceId: string;
}

/**
 * Trace record for retrieval.
 */
export interface TraceRecord {
  /** Trace ID */
  traceId: string;

  /** Span ID */
  spanId: string;

  /** Parent span ID */
  parentSpanId?: string;

  /** Agent name */
  agentName: AgentType;

  /** Agent version */
  agentVersion: string;

  /** Snapshot ID */
  snapshotId: string;

  /** Run ID */
  runId: string;

  /** Cycle ID */
  cycleId: string;

  /** Start time */
  startTime: string;

  /** End time */
  endTime: string;

  /** Duration in ms */
  durationMs: number;

  /** Status */
  status: "OK" | "ERROR";

  /** Attributes */
  attributes: Record<string, unknown>;

  /** Error if any */
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
}

/**
 * LangSmith configuration.
 */
export interface LangSmithConfig {
  /** API key (defaults to LANGSMITH_API_KEY env var) */
  apiKey?: string;

  /** Project name */
  projectName: string;

  /** Environment */
  environment: "BACKTEST" | "PAPER" | "LIVE";

  /** Trace sampling rate (0-1) */
  samplingRate: number;

  /** Enable tracing */
  enabled: boolean;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default LangSmith configuration.
 */
export const DEFAULT_LANGSMITH_CONFIG: LangSmithConfig = {
  projectName: "cream-trading-system",
  environment: "PAPER",
  samplingRate: 1.0, // 100% in PAPER, can be reduced in LIVE
  enabled: true,
};

/**
 * Get sampling rate for environment.
 */
export function getSamplingRateForEnvironment(
  environment: "BACKTEST" | "PAPER" | "LIVE"
): number {
  switch (environment) {
    case "BACKTEST":
      return 1.0; // 100% - need full traces for analysis
    case "PAPER":
      return 1.0; // 100% - need full traces for testing
    case "LIVE":
      return 0.1; // 10% - reduce overhead in production
  }
}

// ============================================
// Mock Trace Storage
// ============================================

/**
 * In-memory trace storage for testing.
 * In production, traces go to LangSmith.
 */
const traceStore: TraceRecord[] = [];

/**
 * Active spans for nested tracing.
 */
const activeSpans = new Map<string, Span>();

/**
 * Generate unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================
// Core Tracing Functions
// ============================================

/**
 * Create a new span for tracing.
 */
export function createSpan(
  name: string,
  parentSpanId?: string
): Span {
  const spanId = generateId();
  const traceId = parentSpanId
    ? activeSpans.get(parentSpanId)?.traceId ?? generateId()
    : generateId();

  const attributes: Record<string, unknown> = {};
  let status: "OK" | "ERROR" = "OK";
  let error: Error | undefined;
  const startTime = new Date().toISOString();

  const span: Span = {
    spanId,
    traceId,
    setAttributes: (attrs) => {
      Object.assign(attributes, attrs);
    },
    setStatus: (s) => {
      status = s;
    },
    recordError: (e) => {
      error = e;
      status = "ERROR";
    },
    end: () => {
      const endTime = new Date().toISOString();
      const durationMs =
        new Date(endTime).getTime() - new Date(startTime).getTime();

      // Store trace record
      traceStore.push({
        traceId,
        spanId,
        parentSpanId,
        agentName: attributes["agent.name"] as AgentType,
        agentVersion: attributes["agent.version"] as string,
        snapshotId: attributes["input.snapshot_id"] as string,
        runId: attributes["run_id"] as string,
        cycleId: attributes["cycle_id"] as string,
        startTime,
        endTime,
        durationMs,
        status,
        attributes,
        error: error
          ? {
              type: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
      });

      activeSpans.delete(spanId);
    },
  };

  activeSpans.set(spanId, span);
  return span;
}

/**
 * Execute a function with tracing.
 * This is a mock implementation of LangSmith's trace() function.
 */
export async function trace<T>(
  fn: (span: Span) => Promise<T>,
  options: { name: string; metadata?: TraceMetadata; parentSpanId?: string }
): Promise<T> {
  const span = createSpan(options.name, options.parentSpanId);

  if (options.metadata) {
    span.setAttributes({
      run_id: options.metadata.runId,
      cycle_id: options.metadata.cycleId,
      environment: options.metadata.environment,
    });
  }

  try {
    const result = await fn(span);
    span.setStatus("OK");
    span.end();
    return result;
  } catch (error) {
    span.recordError(error as Error);
    span.end();
    throw error;
  }
}

/**
 * Run an agent with tracing instrumentation.
 */
export async function runAgentWithTracing<T>(
  agent: TracedAgent,
  input: AgentInput,
  metadata: TraceMetadata,
  config: LangSmithConfig = DEFAULT_LANGSMITH_CONFIG
): Promise<T> {
  // Check if tracing is enabled
  if (!config.enabled) {
    return agent.run<T>(input);
  }

  // Check sampling rate
  if (Math.random() > config.samplingRate) {
    return agent.run<T>(input);
  }

  return trace(
    async (span) => {
      // Set agent metadata
      span.setAttributes({
        "agent.name": agent.name,
        "agent.version": agent.version,
        "input.snapshot_id": input.snapshotId,
        "project.name": config.projectName,
        "project.environment": config.environment,
      });

      const startTime = Date.now();

      try {
        const result = await agent.run<T>(input);

        // Set output metadata
        const output = result as AgentOutput;
        span.setAttributes({
          "output.decision_count": output.decisions?.length ?? 0,
          "output.verdict": output.verdict,
          "output.confidence": output.confidence,
          "timing.duration_ms": Date.now() - startTime,
        });

        return result;
      } catch (error) {
        span.setAttributes({
          "error.occurred": true,
          "timing.duration_ms": Date.now() - startTime,
        });
        throw error;
      }
    },
    { name: `agent.${agent.name}`, metadata }
  );
}

/**
 * Run a trading cycle with nested tracing.
 */
export async function runCycleWithTracing<T>(
  cycleFn: (span: Span) => Promise<T>,
  metadata: TraceMetadata,
  config: LangSmithConfig = DEFAULT_LANGSMITH_CONFIG
): Promise<T> {
  if (!config.enabled) {
    const mockSpan = createSpan("mock");
    try {
      return await cycleFn(mockSpan);
    } finally {
      mockSpan.end();
    }
  }

  return trace(
    async (span) => {
      span.setAttributes({
        "cycle.id": metadata.cycleId,
        "cycle.run_id": metadata.runId,
        "cycle.environment": metadata.environment,
      });

      return cycleFn(span);
    },
    { name: "trading.cycle", metadata }
  );
}

// ============================================
// Trace Retrieval Functions
// ============================================

/**
 * Get traces by run ID.
 */
export function getTracesByRunId(runId: string): TraceRecord[] {
  return traceStore.filter((t) => t.runId === runId);
}

/**
 * Get traces by cycle ID.
 */
export function getTracesByCycleId(cycleId: string): TraceRecord[] {
  return traceStore.filter((t) => t.cycleId === cycleId);
}

/**
 * Get agent traces within date range.
 */
export function getAgentTraces(
  agentName: AgentType,
  startDate: Date,
  endDate: Date
): TraceRecord[] {
  return traceStore.filter((t) => {
    const traceTime = new Date(t.startTime);
    return (
      t.agentName === agentName &&
      traceTime >= startDate &&
      traceTime <= endDate
    );
  });
}

/**
 * Get traces with errors.
 */
export function getErrorTraces(): TraceRecord[] {
  return traceStore.filter((t) => t.status === "ERROR");
}

/**
 * Get trace by ID.
 */
export function getTraceById(traceId: string): TraceRecord[] {
  return traceStore.filter((t) => t.traceId === traceId);
}

// ============================================
// Dataset Export
// ============================================

/**
 * Dataset example format.
 */
export interface DatasetExample {
  /** Unique ID */
  id: string;

  /** Input data */
  input: Record<string, unknown>;

  /** Expected output */
  expectedOutput?: Record<string, unknown>;

  /** Actual output */
  actualOutput: Record<string, unknown>;

  /** Metadata */
  metadata: {
    traceId: string;
    agentName: AgentType;
    timestamp: string;
  };
}

/**
 * Export traces to dataset format.
 * In production, this would call LangSmith API to create a dataset.
 */
export function exportTracesToDataset(
  traceIds: string[],
  datasetName: string
): DatasetExample[] {
  const examples: DatasetExample[] = [];

  for (const traceId of traceIds) {
    const traces = getTraceById(traceId);

    for (const t of traces) {
      examples.push({
        id: `${datasetName}-${t.spanId}`,
        input: {
          snapshotId: t.snapshotId,
          ...Object.fromEntries(
            Object.entries(t.attributes).filter(([k]) => k.startsWith("input."))
          ),
        },
        actualOutput: Object.fromEntries(
          Object.entries(t.attributes).filter(([k]) => k.startsWith("output."))
        ),
        metadata: {
          traceId: t.traceId,
          agentName: t.agentName,
          timestamp: t.startTime,
        },
      });
    }
  }

  return examples;
}

/**
 * Create a golden dataset from successful traces.
 */
export function createGoldenDataset(
  agentName: AgentType,
  count: number = 100
): DatasetExample[] {
  const successfulTraces = traceStore
    .filter((t) => t.agentName === agentName && t.status === "OK")
    .slice(-count);

  const traceIds = [...new Set(successfulTraces.map((t) => t.traceId))];
  return exportTracesToDataset(traceIds, `golden-${agentName}`);
}

// ============================================
// Error Tracing
// ============================================

/**
 * Trace an error with full context.
 */
export function traceError(
  error: Error,
  context: {
    agentName: AgentType;
    runId: string;
    cycleId: string;
    snapshotId: string;
  }
): void {
  const span = createSpan(`error.${context.agentName}`);

  span.setAttributes({
    "agent.name": context.agentName,
    "input.snapshot_id": context.snapshotId,
    run_id: context.runId,
    cycle_id: context.cycleId,
    "error.type": error.name,
    "error.message": error.message,
    "error.stack": error.stack,
  });

  span.recordError(error);
  span.end();
}

// ============================================
// Utility Functions
// ============================================

/**
 * Clear all traces (for testing).
 */
export function clearTraces(): void {
  traceStore.length = 0;
  activeSpans.clear();
}

/**
 * Get trace store size (for testing).
 */
export function getTraceCount(): number {
  return traceStore.length;
}

/**
 * Get all traces (for testing/debugging).
 */
export function getAllTraces(): TraceRecord[] {
  return [...traceStore];
}

/**
 * Check if LangSmith is configured.
 */
export function isLangSmithConfigured(): boolean {
  return Boolean(
    process.env.LANGSMITH_API_KEY || Bun.env.LANGSMITH_API_KEY
  );
}

/**
 * Get LangSmith configuration from environment.
 */
export function getLangSmithConfigFromEnv(): LangSmithConfig {
  const environment = (process.env.CREAM_ENV ?? "PAPER") as
    | "BACKTEST"
    | "PAPER"
    | "LIVE";

  return {
    apiKey: process.env.LANGSMITH_API_KEY ?? Bun.env.LANGSMITH_API_KEY,
    projectName:
      process.env.LANGSMITH_PROJECT ?? "cream-trading-system",
    environment,
    samplingRate: getSamplingRateForEnvironment(environment),
    enabled: isLangSmithConfigured(),
  };
}

export default {
  trace,
  runAgentWithTracing,
  runCycleWithTracing,
  createSpan,
  getTracesByRunId,
  getTracesByCycleId,
  getAgentTraces,
  getErrorTraces,
  getTraceById,
  exportTracesToDataset,
  createGoldenDataset,
  traceError,
  clearTraces,
  getTraceCount,
  getAllTraces,
  isLangSmithConfigured,
  getLangSmithConfigFromEnv,
  DEFAULT_LANGSMITH_CONFIG,
};
