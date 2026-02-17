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
	const cycleIdRef = useRef(cycleId);
	cycleIdRef.current = cycleId;

	const {
		state,
		setStatus,
		setProgress,
		setPhase,
		setCurrentStep,
		setResult,
		setError,
		setIsSubscribed,
		reset,
	} = useCycleProgressState();

	const handleMessage = useCycleMessageHandler({
		queryClient,
		setStatus,
		setProgress,
		setPhase,
		setCurrentStep,
		setResult,
		setError,
		cycleIdRef,
	});

	useCycleSocketEffect({
		cycleId,
		lastMessage,
		handleMessage,
	});

	useCycleSubscriptionEffect({
		cycleId,
		connected,
		subscribe,
		unsubscribe,
		reset,
		setStatus,
		setIsSubscribed,
	});

	return useMemo(() => selectCycleProgressState(state), [state]);
}

function selectCycleProgressState(state: {
	status: CycleStatus;
	progress: CycleProgressData | null;
	phase: CyclePhase | null;
	currentStep: string | null;
	result: CycleResult | null;
	error: string | null;
	isSubscribed: boolean;
}): UseCycleProgressReturn {
	return {
		status: state.status,
		progress: state.progress,
		phase: state.phase,
		currentStep: state.currentStep,
		result: state.result,
		error: state.error,
		isSubscribed: state.isSubscribed,
	};
}

function useCycleProgressState() {
	const [status, setStatus] = useState<CycleStatus>("idle");
	const [progress, setProgress] = useState<CycleProgressData | null>(null);
	const [phase, setPhase] = useState<CyclePhase | null>(null);
	const [currentStep, setCurrentStep] = useState<string | null>(null);
	const [result, setResult] = useState<CycleResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubscribed, setIsSubscribed] = useState(false);

	const state = useMemo(
		() => ({
			status,
			progress,
			phase,
			currentStep,
			result,
			error,
			isSubscribed,
		}),
		[status, progress, phase, currentStep, result, error, isSubscribed],
	);

	const reset = useCallback(() => {
		setStatus("idle");
		setProgress(null);
		setPhase(null);
		setCurrentStep(null);
		setResult(null);
		setError(null);
		setIsSubscribed(false);
	}, []);

	return {
		state,
		setStatus,
		setProgress,
		setPhase,
		setCurrentStep,
		setResult,
		setError,
		setIsSubscribed,
		reset,
	};
}

function isCycleMessage(raw: unknown): raw is CycleWSMessage {
	return (
		raw !== null && typeof raw === "object" && "type" in raw && "data" in raw && raw.type !== null
	);
}

function handleProgressMessage(
	message: CycleProgressMessage["data"],
	setStatus: (status: CycleStatus) => void,
	setProgress: React.Dispatch<React.SetStateAction<CycleProgressData | null>>,
	setPhase: (phase: CyclePhase | null) => void,
	setCurrentStep: (step: string | null) => void,
) {
	setStatus("running");
	setPhase(message.phase);
	setCurrentStep(message.message);
	setProgress({
		cycleId: message.cycleId,
		phase: message.phase,
		step: message.step,
		progress: message.progress,
		message: message.message,
		activeSymbol: message.activeSymbol,
		totalSymbols: message.totalSymbols,
		completedSymbols: message.completedSymbols,
		startedAt: message.startedAt,
		estimatedCompletion: message.estimatedCompletion,
		timestamp: message.timestamp,
	});
}

function handleResultMessage(
	message: CycleResultMessage["data"],
	setStatus: (status: CycleStatus) => void,
	setPhase: (phase: CyclePhase | null) => void,
	setProgress: React.Dispatch<React.SetStateAction<CycleProgressData | null>>,
	setResult: React.Dispatch<React.SetStateAction<CycleResult | null>>,
	setError: (error: string | null) => void,
	queryClient: ReturnType<typeof useQueryClient>,
) {
	setResult({
		cycleId: message.cycleId,
		environment: message.environment as "PAPER" | "LIVE",
		status: message.status,
		result: message.result,
		error: message.error,
		durationMs: message.durationMs,
		configVersion: message.configVersion,
		timestamp: message.timestamp,
	});

	if (message.status === "completed") {
		setStatus("completed");
		setPhase("COMPLETE");
		setProgress((prev) => (prev ? { ...prev, progress: 100 } : null));
	} else {
		setStatus("failed");
		setError(message.error ?? "Cycle failed");
	}

	queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
	queryClient.invalidateQueries({ queryKey: queryKeys.decisions.all });
}

function useCycleMessageHandler({
	queryClient,
	setStatus,
	setProgress,
	setPhase,
	setCurrentStep,
	setResult,
	setError,
	cycleIdRef,
}: {
	queryClient: ReturnType<typeof useQueryClient>;
	setStatus: (status: CycleStatus) => void;
	setProgress: React.Dispatch<React.SetStateAction<CycleProgressData | null>>;
	setPhase: (phase: CyclePhase | null) => void;
	setCurrentStep: (step: string | null) => void;
	setResult: React.Dispatch<React.SetStateAction<CycleResult | null>>;
	setError: (error: string | null) => void;
	cycleIdRef: React.RefObject<string | null>;
}) {
	const handleProgress = useCallback(
		(message: CycleProgressMessage["data"]) => {
			handleProgressMessage(message, setStatus, setProgress, setPhase, setCurrentStep);
		},
		[setCurrentStep, setPhase, setProgress, setStatus],
	);

	const handleResult = useCallback(
		(message: CycleResultMessage["data"]) => {
			handleResultMessage(
				message,
				setStatus,
				setPhase,
				setProgress,
				setResult,
				setError,
				queryClient,
			);
		},
		[queryClient, setError, setPhase, setProgress, setResult, setStatus],
	);

	return useCallback(
		(message: CycleWSMessage) => {
			if (message.data?.cycleId !== cycleIdRef.current) {
				return;
			}

			if (message.type === "cycle_progress") {
				handleProgress(message.data);
				return;
			}

			handleResult(message.data);
		},
		[handleProgress, handleResult, cycleIdRef],
	);
}

function useCycleSocketEffect({
	cycleId,
	lastMessage,
	handleMessage,
}: {
	cycleId: string | null;
	lastMessage: unknown;
	handleMessage: (message: CycleWSMessage) => void;
}) {
	useEffect(() => {
		if (!lastMessage || !cycleId) {
			return;
		}
		if (!isCycleMessage(lastMessage)) {
			return;
		}
		if (lastMessage.type !== "cycle_progress" && lastMessage.type !== "cycle_result") {
			return;
		}
		handleMessage(lastMessage);
	}, [lastMessage, cycleId, handleMessage]);
}

function useCycleSubscriptionEffect({
	cycleId,
	connected,
	subscribe,
	unsubscribe,
	reset,
	setStatus,
	setIsSubscribed,
}: {
	cycleId: string | null;
	connected: boolean;
	subscribe: (channels: string[]) => void;
	unsubscribe: (channels: string[]) => void;
	reset: () => void;
	setStatus: (status: CycleStatus) => void;
	setIsSubscribed: (isSubscribed: boolean) => void;
}) {
	useEffect(() => {
		if (!cycleId) {
			reset();
			setIsSubscribed(false);
			return;
		}
		if (!connected) {
			setIsSubscribed(false);
			return;
		}

		subscribe(["cycles"]);
		setIsSubscribed(true);
		setStatus("running");

		return () => {
			unsubscribe(["cycles"]);
			setIsSubscribed(false);
		};
	}, [cycleId, connected, subscribe, unsubscribe, reset, setIsSubscribed, setStatus]);
}

export default useCycleProgress;
