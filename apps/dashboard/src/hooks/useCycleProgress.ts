/**
 * useCycleProgress Hook
 *
 * React hook for real-time trading cycle progress updates via WebSocket.
 * Subscribes to cycle-specific events and provides progress state.
 *
 * @see docs/plans/22-self-service-dashboard.md Phase 3
 */

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queryKeys } from "@/lib/api/query-client";
import type {
  CyclePhase,
  CycleProgress as CycleProgressData,
  CycleResult,
  DecisionSummaryBrief,
  OrderSummaryBrief,
} from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

// ============================================
// Types
// ============================================

/**
 * Cycle status.
 */
export type CycleStatus = "idle" | "running" | "completed" | "failed";

/**
 * Return type for useCycleProgress hook.
 */
export interface UseCycleProgressReturn {
  /** Current cycle status */
  status: CycleStatus;
  /** Progress information */
  progress: CycleProgressData | null;
  /** Current phase */
  phase: CyclePhase | null;
  /** Human-readable step description */
  currentStep: string | null;
  /** Result (when completed) */
  result: CycleResult | null;
  /** Error message (if failed) */
  error: string | null;
  /** Whether subscribed to WebSocket */
  isSubscribed: boolean;
}

// ============================================
// Message Types (match server messages)
// ============================================

interface CycleProgressMessage {
  type: "cycle_progress";
  data: {
    cycleId: string;
    phase: CyclePhase;
    step: string;
    progress: number;
    message: string;
    activeSymbol?: string;
    totalSymbols?: number;
    completedSymbols?: number;
    startedAt?: string;
    estimatedCompletion?: string;
    timestamp: string;
  };
}

interface CycleResultMessage {
  type: "cycle_result";
  data: {
    cycleId: string;
    environment: string;
    status: "completed" | "failed";
    result?: {
      approved: boolean;
      iterations: number;
      decisions: DecisionSummaryBrief[];
      orders: OrderSummaryBrief[];
    };
    error?: string;
    durationMs: number;
    configVersion?: string;
    timestamp: string;
  };
}

type CycleWSMessage = CycleProgressMessage | CycleResultMessage;

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for real-time cycle progress updates.
 *
 * @param cycleId - The cycle ID to track (null to disable)
 * @returns Cycle progress state
 *
 * @example
 * ```tsx
 * function CycleStatus({ id }: { id: string }) {
 *   const { status, progress, phase, currentStep, error } = useCycleProgress(id);
 *
 *   if (status === "running" && progress) {
 *     return (
 *       <div>
 *         <ProgressBar value={progress.progress} />
 *         <span>{phase}: {currentStep}</span>
 *       </div>
 *     );
 *   }
 *
 *   if (status === "failed") {
 *     return <Alert variant="error">{error}</Alert>;
 *   }
 *
 *   return <span>Cycle complete</span>;
 * }
 * ```
 */
export function useCycleProgress(cycleId: string | null): UseCycleProgressReturn {
  const queryClient = useQueryClient();
  const { lastMessage, subscribe, unsubscribe, connected } = useWebSocketContext();

  // State
  const [status, setStatus] = useState<CycleStatus>("idle");
  const [progress, setProgress] = useState<CycleProgressData | null>(null);
  const [phase, setPhase] = useState<CyclePhase | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [result, setResult] = useState<CycleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Track current cycle ID in ref to avoid stale closures
  const cycleIdRef = useRef(cycleId);
  cycleIdRef.current = cycleId;

  // Reset state when cycle ID changes
  const resetState = useCallback(() => {
    setStatus("idle");
    setProgress(null);
    setPhase(null);
    setCurrentStep(null);
    setResult(null);
    setError(null);
  }, []);

  // Handle cycle messages
  const handleMessage = useCallback(
    (message: CycleWSMessage) => {
      // Filter messages for our cycle
      if (!("data" in message) || !message.data) {
        return;
      }

      const data = message.data as { cycleId?: string };
      if (data.cycleId !== cycleIdRef.current) {
        return;
      }

      switch (message.type) {
        case "cycle_progress": {
          const progressData = message.data as CycleProgressMessage["data"];
          setStatus("running");
          setPhase(progressData.phase);
          setCurrentStep(progressData.message);
          setProgress({
            cycleId: progressData.cycleId,
            phase: progressData.phase,
            step: progressData.step,
            progress: progressData.progress,
            message: progressData.message,
            activeSymbol: progressData.activeSymbol,
            totalSymbols: progressData.totalSymbols,
            completedSymbols: progressData.completedSymbols,
            startedAt: progressData.startedAt,
            estimatedCompletion: progressData.estimatedCompletion,
            timestamp: progressData.timestamp,
          });
          break;
        }

        case "cycle_result": {
          const resultData = message.data as CycleResultMessage["data"];
          if (resultData.status === "completed") {
            setStatus("completed");
            setPhase("COMPLETE");
            setProgress((prev) => (prev ? { ...prev, progress: 100 } : null));
          } else {
            setStatus("failed");
            setError(resultData.error ?? "Cycle failed");
          }

          setResult({
            cycleId: resultData.cycleId,
            environment: resultData.environment as "BACKTEST" | "PAPER" | "LIVE",
            status: resultData.status,
            result: resultData.result,
            error: resultData.error,
            durationMs: resultData.durationMs,
            configVersion: resultData.configVersion,
            timestamp: resultData.timestamp,
          });

          // Invalidate TanStack Query cache to refresh data
          queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.decisions.all });
          break;
        }
      }
    },
    [queryClient]
  );

  // Process incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage || !cycleId) {
      return;
    }

    const message = lastMessage as unknown as CycleWSMessage;
    if (
      (message.type === "cycle_progress" || message.type === "cycle_result") &&
      typeof message.data === "object" &&
      message.data !== null
    ) {
      handleMessage(message);
    }
  }, [lastMessage, cycleId, handleMessage]);

  // Subscribe/unsubscribe when cycle ID changes
  useEffect(() => {
    if (!cycleId) {
      resetState();
      setIsSubscribed(false);
      return;
    }

    // Only subscribe when connected
    if (!connected) {
      setIsSubscribed(false);
      return;
    }

    // Subscribe to cycles channel
    subscribe(["cycles"]);
    setIsSubscribed(true);
    setStatus("running");

    // Cleanup: unsubscribe when ID changes or component unmounts
    return () => {
      unsubscribe(["cycles"]);
      setIsSubscribed(false);
    };
  }, [cycleId, connected, subscribe, unsubscribe, resetState]);

  // Memoize return value
  return useMemo(
    () => ({
      status,
      progress,
      phase,
      currentStep,
      result,
      error,
      isSubscribed,
    }),
    [status, progress, phase, currentStep, result, error, isSubscribed]
  );
}

export default useCycleProgress;
