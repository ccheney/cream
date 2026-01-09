/**
 * Captures execution traces using LangSmith SDK for debugging,
 * dataset creation, and production monitoring.
 *
 * @see docs/plans/14-testing.md lines 610-644
 */

import { requireEnv } from "@cream/domain";
import type { AgentType } from "./index.js";

export interface TracedAgent {
  name: AgentType;
  version: string;
  run: <T>(input: AgentInput) => Promise<T>;
}

export interface AgentInput {
  snapshotId: string;
  [key: string]: unknown;
}

export interface AgentOutput {
  decisions?: unknown[];
  verdict?: "APPROVE" | "REJECT";
  confidence?: number;
  [key: string]: unknown;
}

export interface TraceMetadata {
  runId: string;
  cycleId: string;
  environment?: "BACKTEST" | "PAPER" | "LIVE";
  [key: string]: unknown;
}

export interface Span {
  setAttributes: (attributes: Record<string, unknown>) => void;
  setStatus: (status: "OK" | "ERROR") => void;
  recordError: (error: Error) => void;
  end: () => void;
  spanId: string;
  traceId: string;
}

export interface TraceRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  agentName: AgentType;
  agentVersion: string;
  snapshotId: string;
  runId: string;
  cycleId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: "OK" | "ERROR";
  attributes: Record<string, unknown>;
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
}

export interface LangSmithConfig {
  apiKey?: string;
  projectName: string;
  environment: "BACKTEST" | "PAPER" | "LIVE";
  samplingRate: number;
  enabled: boolean;
}

export const DEFAULT_LANGSMITH_CONFIG: LangSmithConfig = {
  projectName: "cream-trading-system",
  environment: "PAPER",
  samplingRate: 1.0,
  enabled: true,
};

export function getSamplingRateForEnvironment(environment: "BACKTEST" | "PAPER" | "LIVE"): number {
  switch (environment) {
    case "BACKTEST":
      return 1.0;
    case "PAPER":
      return 1.0;
    case "LIVE":
      // Reduce overhead in production while still capturing meaningful sample
      return 0.1;
  }
}

/** In production, traces go to LangSmith instead of this in-memory store. */
const traceStore: TraceRecord[] = [];

/** Tracks active spans to support nested tracing with parent-child relationships. */
const activeSpans = new Map<string, Span>();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createSpan(_name: string, parentSpanId?: string): Span {
  const spanId = generateId();
  const traceId = parentSpanId
    ? (activeSpans.get(parentSpanId)?.traceId ?? generateId())
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
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

      traceStore.push({
        traceId,
        spanId,
        parentSpanId,
        agentName: attributes["agent.name"] as AgentType,
        agentVersion: attributes["agent.version"] as string,
        snapshotId: attributes["input.snapshot_id"] as string,
        runId: attributes.run_id as string,
        cycleId: attributes.cycle_id as string,
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

/** Mock implementation of LangSmith's trace() function for local development. */
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

export async function runAgentWithTracing<T>(
  agent: TracedAgent,
  input: AgentInput,
  metadata: TraceMetadata,
  config: LangSmithConfig = DEFAULT_LANGSMITH_CONFIG
): Promise<T> {
  if (!config.enabled) {
    return agent.run<T>(input);
  }

  if (Math.random() > config.samplingRate) {
    return agent.run<T>(input);
  }

  return trace(
    async (span) => {
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

export function getTracesByRunId(runId: string): TraceRecord[] {
  return traceStore.filter((t) => t.runId === runId);
}

export function getTracesByCycleId(cycleId: string): TraceRecord[] {
  return traceStore.filter((t) => t.cycleId === cycleId);
}

export function getAgentTraces(
  agentName: AgentType,
  startDate: Date,
  endDate: Date
): TraceRecord[] {
  return traceStore.filter((t) => {
    const traceTime = new Date(t.startTime);
    return t.agentName === agentName && traceTime >= startDate && traceTime <= endDate;
  });
}

export function getErrorTraces(): TraceRecord[] {
  return traceStore.filter((t) => t.status === "ERROR");
}

export function getTraceById(traceId: string): TraceRecord[] {
  return traceStore.filter((t) => t.traceId === traceId);
}

export interface DatasetExample {
  id: string;
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  actualOutput: Record<string, unknown>;
  metadata: {
    traceId: string;
    agentName: AgentType;
    timestamp: string;
  };
}

/** In production, this calls LangSmith API to create a dataset. */
export function exportTracesToDataset(traceIds: string[], datasetName: string): DatasetExample[] {
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

export function createGoldenDataset(agentName: AgentType, count = 100): DatasetExample[] {
  const successfulTraces = traceStore
    .filter((t) => t.agentName === agentName && t.status === "OK")
    .slice(-count);

  const traceIds = [...new Set(successfulTraces.map((t) => t.traceId))];
  return exportTracesToDataset(traceIds, `golden-${agentName}`);
}

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

/** For testing only. */
export function clearTraces(): void {
  traceStore.length = 0;
  activeSpans.clear();
}

/** For testing only. */
export function getTraceCount(): number {
  return traceStore.length;
}

/** For testing/debugging only. */
export function getAllTraces(): TraceRecord[] {
  return [...traceStore];
}

export function isLangSmithConfigured(): boolean {
  return Boolean(process.env.LANGSMITH_API_KEY || Bun.env.LANGSMITH_API_KEY);
}

export function getLangSmithConfigFromEnv(): LangSmithConfig {
  const environment = requireEnv();

  return {
    apiKey: process.env.LANGSMITH_API_KEY ?? Bun.env.LANGSMITH_API_KEY,
    projectName: process.env.LANGSMITH_PROJECT ?? "cream-trading-system",
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
