"use client";

import type React from "react";
import { EconomicCalendarWidget } from "@/components/market";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import {
	AlertsBanner,
	DashboardHeader,
	EventFeedSection,
	OODAPhaseGrid,
	PortfolioSummary,
	RecentDecisions,
	SystemStatusBanner,
	TradingCycleControl,
} from "./components/index";
import {
	useCycleManagement,
	useDashboardData,
	useNextCycleDisplay,
	useSystemControls,
} from "./hooks";

export default function DashboardPage(): React.JSX.Element {
	const { connected, feedEvents, status, portfolio, decisions } = useDashboardData();
	const { startSystem, stopSystem, pauseSystem } = useSystemControls();

	const cycleManagement = useCycleManagement(status.data);
	const nextCycleDisplay = useNextCycleDisplay(status.data?.nextCycleTime);

	return (
		<div className="space-y-6">
			<DashboardHeader
				connected={connected}
				statusFetching={status.isFetching}
				nextCycleDisplay={nextCycleDisplay}
				systemControls={{
					status: status.data,
					isLoading: status.isLoading,
					onStart: () => startSystem.mutate({}),
					onStop: () => stopSystem.mutate({}),
					onPause: () => pauseSystem.mutate(),
					isStarting: startSystem.isPending,
					isStopping: stopSystem.isPending,
					isPausing: pauseSystem.isPending,
				}}
			/>

			<QueryErrorBoundary title="Failed to load system status">
				<SystemStatusBanner status={status.data} isLoading={status.isLoading} />

				<TradingCycleControl
					status={status.data}
					activeCycleId={cycleManagement.activeCycleId}
					cycleInProgress={cycleManagement.cycleInProgress}
					useDraftConfig={cycleManagement.useDraftConfig}
					onUseDraftConfigChange={cycleManagement.setUseDraftConfig}
					onTriggerCycle={cycleManagement.handleTriggerCycle}
					onCycleComplete={cycleManagement.handleCycleComplete}
					onCycleError={cycleManagement.handleCycleError}
				/>

				<OODAPhaseGrid
					currentPhase={cycleManagement.activeCycle?.phase}
					isRunning={cycleManagement.cycleIsRunning}
					isLoading={status.isLoading}
				/>
			</QueryErrorBoundary>

			<QueryErrorBoundary title="Failed to load portfolio">
				<PortfolioSummary portfolio={portfolio.data} isLoading={portfolio.isLoading} />
			</QueryErrorBoundary>

			{status.data?.alerts && status.data.alerts.length > 0 && (
				<AlertsBanner alerts={status.data.alerts} />
			)}

			<QueryErrorBoundary title="Failed to load economic calendar">
				<EconomicCalendarWidget days={3} impact="high" maxEvents={3} compact />
			</QueryErrorBoundary>

			<QueryErrorBoundary title="Failed to load decisions">
				<RecentDecisions
					decisions={decisions.data?.items}
					isLoading={decisions.isLoading}
					isFetching={decisions.isFetching}
				/>
			</QueryErrorBoundary>

			<EventFeedSection events={feedEvents} />
		</div>
	);
}
