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
import { useAgentStreamingStore } from "@/stores/agent-streaming-store";

export type CycleStatus = "idle" | "running" | "completed" | "failed";

export interface UseCycleProgressReturn {
	status: CycleStatus;
	progress: CycleProgressData | null;
	phase: CyclePhase | null;
	currentStep: string | null;
	result: CycleResult | null;
	error: string | null;
	isSubscribed: boolean;
}

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

export function useCycleProgress(cycleId: string | null): UseCycleProgressReturn {
	const queryClient = useQueryClient();
	const { lastMessage, subscribe, unsubscribe, connected } = useWebSocketContext();
	const markCycleFailed = useAgentStreamingStore((state) => state.markCycleFailed);

	const [status, setStatus] = useState<CycleStatus>("idle");
	const [progress, setProgress] = useState<CycleProgressData | null>(null);
	const [phase, setPhase] = useState<CyclePhase | null>(null);
	const [currentStep, setCurrentStep] = useState<string | null>(null);
	const [result, setResult] = useState<CycleResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubscribed, setIsSubscribed] = useState(false);

	// Ref avoids stale closures in handleMessage callback
	const cycleIdRef = useRef(cycleId);
	cycleIdRef.current = cycleId;

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
						// Mark all processing agents as error in the streaming store
						markCycleFailed(resultData.error);
					}

					setResult({
						cycleId: resultData.cycleId,
						environment: resultData.environment as "PAPER" | "LIVE",
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
		[queryClient, markCycleFailed]
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
