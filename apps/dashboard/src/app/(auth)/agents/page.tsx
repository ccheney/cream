"use client";

/**
 * Agents Page - Interactive OODA workflow visualization with real-time streaming
 *
 * Displays 8-agent consensus network as vertical flow diagram with
 * animated connections showing data flow between phases.
 *
 * Features:
 * - Live mode: Real-time streaming from WebSocket
 * - Historical mode: Load past cycles from database
 *
 * @see docs/plans/43-agent-network-visualization.md
 * @see docs/plans/44-cycle-history-persistence.md
 */

import { ArrowLeft, History } from "lucide-react";
import { useCallback, useState } from "react";
import {
	AGENT_METADATA,
	AgentNetwork,
	type NetworkAgentType,
} from "@/components/agents/AgentNetwork";
import { AgentStreamingDetail } from "@/components/agents/AgentStreamingDetail";
import { CycleHistoryPanel } from "@/components/agents/CycleHistoryPanel";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { type AgentType, useAgentStreaming } from "@/hooks/useAgentStreaming";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useAgentStreamingActions } from "@/stores/agent-streaming-store";

// ============================================
// Type Mapping
// ============================================

/** Map NetworkAgentType to AgentType for store compatibility */
function toStoreAgentType(networkType: NetworkAgentType): AgentType {
	return networkType as AgentType;
}

/** Map NetworkAgentType to display name */
function getAgentDisplayName(agentType: NetworkAgentType | null): string {
	if (!agentType) {
		return "";
	}
	return AGENT_METADATA[agentType]?.displayName ?? agentType;
}

// ============================================
// Main Component
// ============================================

export default function AgentsPage() {
	const [selectedAgent, setSelectedAgent] = useState<NetworkAgentType | null>(null);
	const [selectedHistoricalCycleId, setSelectedHistoricalCycleId] = useState<string | null>(null);

	// Responsive breakpoint detection
	const { isMobile, isTablet } = useMediaQuery();
	const isCompact = isMobile || isTablet;

	// Real-time status via WebSocket (replaces HTTP polling)
	const { isSubscribed: statusSubscribed, hasData: hasStatusData } = useAgentStatus();

	// Real-time streaming state (tool calls, reasoning)
	const {
		agents: streamingAgents,
		currentCycleId,
		isSubscribed,
		viewMode,
		historicalCycleId,
	} = useAgentStreaming();

	const { returnToLive } = useAgentStreamingActions();

	// Convert store Map to NetworkAgentType Map
	const networkAgents = streamingAgents as Map<
		NetworkAgentType,
		typeof streamingAgents extends Map<unknown, infer V> ? V : never
	>;

	const selectedState = selectedAgent
		? streamingAgents.get(toStoreAgentType(selectedAgent))
		: undefined;

	// Handle agent selection from network
	const handleAgentSelect = useCallback((agentType: NetworkAgentType | null) => {
		setSelectedAgent(agentType);
	}, []);

	// Handle historical cycle selection
	const handleSelectHistoricalCycle = useCallback((cycleId: string) => {
		setSelectedHistoricalCycleId(cycleId);
		// Clear agent selection when loading new cycle
		setSelectedAgent(null);
	}, []);

	// Handle return to live mode
	const handleReturnToLive = useCallback(() => {
		returnToLive();
		setSelectedHistoricalCycleId(null);
		setSelectedAgent(null);
	}, [returnToLive]);

	return (
		<div className="space-y-4">
			{/* Page Header */}
			<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Agents</h1>

			{/* Historical Mode Banner */}
			{viewMode === "historical" && historicalCycleId && (
				<div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<History className="w-4 h-4 text-amber-600 dark:text-amber-400" />
						<span className="text-sm text-amber-800 dark:text-amber-200">
							Viewing historical cycle:{" "}
							<span className="font-mono">{historicalCycleId.slice(0, 16)}...</span>
						</span>
					</div>
					<button
						type="button"
						onClick={handleReturnToLive}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 rounded transition-colors"
					>
						<ArrowLeft className="w-3 h-3" />
						Return to Live
					</button>
				</div>
			)}

			{/* Main Layout: Network + Detail Panel */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Agent Network Visualization */}
				<div className="lg:col-span-2">
					<div className="bg-white dark:bg-night-800 rounded-xl border border-cream-200 dark:border-night-700 p-4">
						<AgentNetwork
							agents={networkAgents}
							cycleId={viewMode === "historical" ? historicalCycleId : currentCycleId}
							selectedAgent={selectedAgent}
							onAgentSelect={handleAgentSelect}
							isLive={viewMode === "live" && (isSubscribed || statusSubscribed)}
							compact={isCompact}
						/>
					</div>

					{/* Loading State: Waiting for WebSocket connection */}
					{viewMode === "live" && !hasStatusData && streamingAgents.size === 0 && (
						<div className="mt-4 p-4 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
							<div className="flex items-center gap-3">
								<div className="w-4 h-4 rounded-full bg-amber-400 animate-pulse" />
								<p className="text-sm text-stone-500 dark:text-stone-400">
									Connecting to streaming service...
								</p>
							</div>
						</div>
					)}
				</div>

				{/* Detail Panel + Cycle History */}
				<div className="lg:col-span-1 space-y-4">
					{/* Streaming Detail */}
					{selectedAgent && selectedState ? (
						<AgentStreamingDetail
							agentType={toStoreAgentType(selectedAgent)}
							state={selectedState}
							cycleId={viewMode === "historical" ? historicalCycleId : currentCycleId}
						/>
					) : selectedAgent ? (
						<div className="bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 p-6">
							<h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mb-2">
								{getAgentDisplayName(selectedAgent)}
							</h3>
							<p className="text-sm text-stone-500 dark:text-stone-400">
								{viewMode === "historical"
									? "No data for this agent in selected cycle"
									: "Waiting for streaming data..."}
							</p>
							{viewMode === "live" && (
								<p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
									Trigger a trading cycle to see real-time tool calls and reasoning.
								</p>
							)}
						</div>
					) : (
						<div className="bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 p-6">
							<p className="text-sm text-stone-500 dark:text-stone-400">
								Click an agent in the network to view{" "}
								{viewMode === "historical" ? "historical" : "streaming"} details
							</p>
						</div>
					)}

					{/* Cycle History Panel */}
					<CycleHistoryPanel
						selectedCycleId={selectedHistoricalCycleId}
						onSelectCycle={handleSelectHistoricalCycle}
					/>
				</div>
			</div>
		</div>
	);
}
