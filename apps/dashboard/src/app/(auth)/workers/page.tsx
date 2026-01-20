"use client";

/**
 * Worker Services Page
 *
 * Dashboard view for triggering and monitoring all worker services.
 * Consolidates scattered worker controls into a single operations-focused view.
 * Updates are received in real-time via WebSocket (workers channel).
 *
 * @see docs/plans/ui/35-worker-services-page.md
 */

import { useEffect } from "react";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import { ServiceStatusCard, WorkerRunsTable } from "@/components/workers";
import {
	useTriggerWorkerService,
	useWorkerRuns,
	useWorkerServicesStatus,
	type WorkerService,
} from "@/hooks/queries";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

// ============================================
// Trigger Labels
// ============================================

const triggerLabels: Record<WorkerService, string> = {
	macro_watch: "Trigger",
	newspaper: "Compile",
	filings_sync: "Sync",
	short_interest: "Trigger",
	sentiment: "Trigger",
	corporate_actions: "Trigger",
	prediction_markets: "Fetch",
};

// ============================================
// Main Component
// ============================================

export default function WorkersPage() {
	const { subscribe, unsubscribe, connected } = useWebSocketContext();
	const { data: statusData, isLoading: statusLoading } = useWorkerServicesStatus();
	const { data: runsData, isLoading: runsLoading } = useWorkerRuns({ limit: 20 });
	const triggerMutation = useTriggerWorkerService();

	// Subscribe to workers channel for real-time updates
	useEffect(() => {
		if (connected) {
			subscribe(["workers"]);
		}
		return () => {
			unsubscribe(["workers"]);
		};
	}, [connected, subscribe, unsubscribe]);

	const handleTrigger = (service: WorkerService) => {
		triggerMutation.mutate({ service });
	};

	const services = statusData?.services ?? [];

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
					Worker Services
				</h1>
			</div>

			{/* Service Status Cards Grid */}
			<QueryErrorBoundary title="Failed to load service status">
				{statusLoading ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
						{[1, 2, 3, 4, 5, 6].map((i) => (
							<div
								key={i}
								className="h-28 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 animate-pulse"
							/>
						))}
					</div>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
						{services.map((service) => (
							<ServiceStatusCard
								key={service.name}
								service={service}
								onTrigger={() => handleTrigger(service.name)}
								triggerLabel={triggerLabels[service.name]}
								isPending={
									triggerMutation.isPending && triggerMutation.variables?.service === service.name
								}
							/>
						))}
					</div>
				)}
			</QueryErrorBoundary>

			{/* Recent Runs Table */}
			<QueryErrorBoundary title="Failed to load recent runs">
				<WorkerRunsTable runs={runsData?.runs} isLoading={runsLoading} />
			</QueryErrorBoundary>
		</div>
	);
}
