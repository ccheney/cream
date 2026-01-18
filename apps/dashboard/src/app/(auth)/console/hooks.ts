/**
 * Custom hooks for dashboard data and utilities.
 */

import { useCallback, useEffect, useState } from "react";
import type { FeedEvent as EventFeedEvent } from "@/components/ui/event-feed";
import {
	usePauseSystem,
	usePortfolioSummary,
	useRecentDecisions,
	useStartSystem,
	useStopSystem,
	useSystemStatus,
	useTriggerCycle,
} from "@/hooks/queries";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { type CyclePhase, useActiveCycle, useCycleActions } from "@/stores/cycle-store";
import { type FeedEvent as StoreFeedEvent, useEventFeedStore } from "@/stores/event-feed-store";

function mapEventType(storeType: StoreFeedEvent["type"]): EventFeedEvent["type"] {
	switch (storeType) {
		case "order_placed":
		case "order_cancelled":
		case "order_rejected":
			return "ORDER";
		case "order_filled":
		case "trade_executed":
			return "FILL";
		case "agent_decision":
			return "DECISION";
		default:
			return "QUOTE";
	}
}

function convertEvents(storeEvents: StoreFeedEvent[]): EventFeedEvent[] {
	return storeEvents.map((event) => ({
		id: event.id,
		type: mapEventType(event.type),
		timestamp: event.timestamp,
		symbol: event.symbol,
		message: event.message,
		metadata: event.metadata,
	}));
}

export interface UseDashboardDataResult {
	connected: boolean;
	feedEvents: EventFeedEvent[];
	status: ReturnType<typeof useSystemStatus>;
	portfolio: ReturnType<typeof usePortfolioSummary>;
	decisions: ReturnType<typeof useRecentDecisions>;
}

export function useDashboardData(): UseDashboardDataResult {
	const { connected } = useWebSocketContext();
	const storeEvents = useEventFeedStore((s) => s.events);
	const feedEvents = convertEvents(storeEvents);
	const status = useSystemStatus();
	const portfolio = usePortfolioSummary();
	const decisions = useRecentDecisions(5);

	return {
		connected,
		feedEvents,
		status,
		portfolio,
		decisions,
	};
}

export interface UseSystemControlsResult {
	startSystem: ReturnType<typeof useStartSystem>;
	stopSystem: ReturnType<typeof useStopSystem>;
	pauseSystem: ReturnType<typeof usePauseSystem>;
}

export function useSystemControls(): UseSystemControlsResult {
	const startSystem = useStartSystem();
	const stopSystem = useStopSystem();
	const pauseSystem = usePauseSystem();

	return { startSystem, stopSystem, pauseSystem };
}

export interface UseCycleManagementResult {
	activeCycle: ReturnType<typeof useActiveCycle>["cycle"];
	cycleIsRunning: boolean;
	activeCycleId: string | null;
	triggerCycle: ReturnType<typeof useTriggerCycle>;
	useDraftConfig: boolean;
	setUseDraftConfig: (value: boolean) => void;
	cycleInProgress: boolean;
	handleTriggerCycle: () => void;
	handleCycleComplete: () => void;
	handleCycleError: () => void;
}

export function useCycleManagement(
	statusData:
		| {
				environment?: string;
				runningCycle?: { cycleId: string; phase?: string | null; startedAt: string } | null;
		  }
		| undefined
): UseCycleManagementResult {
	const { cycle: activeCycle, isRunning: cycleIsRunning } = useActiveCycle();
	const { setCycle, reset: resetCycle } = useCycleActions();
	const triggerCycle = useTriggerCycle();
	const [useDraftConfig, setUseDraftConfig] = useState(false);

	const activeCycleId = activeCycle?.id ?? null;
	const cycleInProgress = triggerCycle.isPending || cycleIsRunning;

	useEffect(() => {
		if (statusData?.runningCycle && !activeCycle) {
			setCycle({
				id: statusData.runningCycle.cycleId,
				phase: (statusData.runningCycle.phase as CyclePhase) ?? "observe",
				progress: 0,
				startedAt: statusData.runningCycle.startedAt,
			});
		} else if (!statusData?.runningCycle && activeCycle && cycleIsRunning) {
			const timer = setTimeout(() => {
				resetCycle();
			}, 1000);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [statusData?.runningCycle, activeCycle, cycleIsRunning, setCycle, resetCycle]);

	const handleTriggerCycle = useCallback(() => {
		if (!statusData?.environment) {
			return;
		}

		triggerCycle.mutate(
			{
				environment: statusData.environment as "PAPER" | "LIVE",
				useDraftConfig,
			},
			{
				onSuccess: (data) => {
					setCycle({
						id: data.cycleId,
						phase: "observe",
						progress: 0,
						startedAt: data.startedAt,
					});
				},
			}
		);
	}, [statusData?.environment, useDraftConfig, triggerCycle, setCycle]);

	const handleCycleComplete = useCallback(() => {
		setTimeout(() => {
			resetCycle();
		}, 3000);
	}, [resetCycle]);

	const handleCycleError = useCallback(() => {
		// Keep showing the error in the CycleProgress component
	}, []);

	return {
		activeCycle,
		cycleIsRunning,
		activeCycleId,
		triggerCycle,
		useDraftConfig,
		setUseDraftConfig,
		cycleInProgress,
		handleTriggerCycle,
		handleCycleComplete,
		handleCycleError,
	};
}

export function useNextCycleDisplay(nextCycleTime: string | null | undefined): string {
	const [display, setDisplay] = useState(() => computeNextCycleDisplay(nextCycleTime));

	useEffect(() => {
		if (!nextCycleTime) {
			setDisplay("--:--");
			return;
		}

		const updateDisplay = () => {
			setDisplay(computeNextCycleDisplay(nextCycleTime));
		};

		updateDisplay();
		const interval = setInterval(updateDisplay, 1000);
		return () => clearInterval(interval);
	}, [nextCycleTime]);

	return display;
}

function computeNextCycleDisplay(nextCycleTime: string | null | undefined): string {
	if (!nextCycleTime) {
		return "--:--";
	}
	const nextCycle = new Date(nextCycleTime);
	const now = new Date();
	const diffMs = nextCycle.getTime() - now.getTime();
	if (diffMs <= 0) {
		return "Now";
	}
	const mins = Math.floor(diffMs / 60000);
	const secs = Math.floor((diffMs % 60000) / 1000);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatCurrency(value: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

export function formatPercent(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function getOODAPhaseStatus(
	cardPhase: string,
	currentPhase: CyclePhase | undefined,
	isRunning: boolean
): "idle" | "active" | "complete" {
	if (!isRunning || !currentPhase) {
		return "idle";
	}

	const phaseOrder: CyclePhase[] = ["observe", "orient", "decide", "act", "complete"];
	const cardIndex = phaseOrder.indexOf(cardPhase.toLowerCase() as CyclePhase);
	const currentIndex = phaseOrder.indexOf(currentPhase);

	if (cardIndex === -1 || currentIndex === -1) {
		return "idle";
	}

	if (currentPhase === "complete") {
		return "complete";
	}

	if (cardIndex < currentIndex) {
		return "complete";
	}
	if (cardIndex === currentIndex) {
		return "active";
	}
	return "idle";
}
