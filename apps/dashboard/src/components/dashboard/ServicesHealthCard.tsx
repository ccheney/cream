/**
 * ServicesHealthCard Component
 *
 * Displays health status for all system services with latency metrics.
 * Implements "Living Indicators" and "Layered Revelation" design patterns.
 *
 * @see docs/plans/ui/20-design-philosophy.md - Living Indicators
 * @see docs/plans/ui/31-realtime-patterns.md - Connection Status
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { StatusDot, type StatusDotStatus } from "../ui/status-dot";
import { Card } from "../ui/surface";

// ============================================
// Types
// ============================================

type ServiceStatus = "ok" | "error" | "degraded";

interface ServiceHealth {
	status: ServiceStatus;
	latencyMs?: number;
	message?: string;
}

interface HealthResponse {
	status: "ok" | "degraded" | "down";
	timestamp: string;
	version: string;
	services: {
		database: ServiceHealth;
		helix: ServiceHealth;
		broker: ServiceHealth;
		marketdata: ServiceHealth;
		execution: ServiceHealth;
		websocket: {
			status: ServiceStatus;
			connections: number;
		};
	};
}

interface ServiceRowProps {
	name: string;
	label: string;
	health: ServiceHealth;
}

// ============================================
// Helpers
// ============================================

function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

function serviceStatusToStatusDot(status: ServiceStatus): StatusDotStatus {
	switch (status) {
		case "ok":
			return "active";
		case "degraded":
			return "idle";
		case "error":
			return "error";
	}
}

function formatLatency(ms?: number): string {
	if (ms === undefined) {
		return "—";
	}
	if (ms < 1) {
		return "<1ms";
	}
	return `${ms}ms`;
}

// ============================================
// Sub-components
// ============================================

function ServiceRow({ label, health }: Omit<ServiceRowProps, "name">) {
	const dotStatus = serviceStatusToStatusDot(health.status);
	const statusText =
		health.status === "ok" ? "Healthy" : health.status === "degraded" ? "Degraded" : "Unhealthy";

	return (
		<div className="flex items-center justify-between py-2 border-b border-cream-300 dark:border-night-700 last:border-b-0">
			<div className="flex items-center gap-2">
				<StatusDot status={dotStatus} size="sm" glow={health.status === "ok"} />
				<span className="text-sm font-medium text-stone-700 dark:text-night-200">{label}</span>
			</div>
			<div className="flex items-center gap-3">
				{health.latencyMs !== undefined && (
					<span className="text-xs font-mono text-stone-500 dark:text-night-400">
						{formatLatency(health.latencyMs)}
					</span>
				)}
				<span
					className={cn(
						"text-xs font-medium",
						health.status === "ok" && "text-green-600 dark:text-green-400",
						health.status === "degraded" && "text-amber-600 dark:text-amber-400",
						health.status === "error" && "text-red-600 dark:text-red-400"
					)}
				>
					{statusText}
				</span>
			</div>
		</div>
	);
}

function OverallStatusBanner({ status }: { status: "ok" | "degraded" | "down" }) {
	const config = {
		ok: {
			bg: "bg-green-50 dark:bg-green-900/20",
			border: "border-green-200 dark:border-green-800",
			text: "text-green-700 dark:text-green-400",
			label: "All Systems Operational",
		},
		degraded: {
			bg: "bg-amber-50 dark:bg-amber-900/20",
			border: "border-amber-200 dark:border-amber-800",
			text: "text-amber-700 dark:text-amber-400",
			label: "Partial Service Disruption",
		},
		down: {
			bg: "bg-red-50 dark:bg-red-900/20",
			border: "border-red-200 dark:border-red-800",
			text: "text-red-700 dark:text-red-400",
			label: "System Unavailable",
		},
	};

	const c = config[status];

	return (
		<div className={cn("px-3 py-2 rounded-md border mb-3", c.bg, c.border)}>
			<div className="flex items-center gap-2">
				<StatusDot
					status={status === "ok" ? "active" : status === "degraded" ? "idle" : "error"}
					size="sm"
					glow={status === "ok"}
				/>
				<span className={cn("text-sm font-medium", c.text)}>{c.label}</span>
			</div>
		</div>
	);
}

function SkeletonRow() {
	return (
		<div className="flex items-center justify-between py-2 border-b border-cream-300 dark:border-night-700 last:border-b-0">
			<div className="flex items-center gap-2">
				<div className="h-4 w-4 rounded-full bg-stone-200 dark:bg-night-700 animate-pulse" />
				<div className="h-4 w-20 rounded bg-stone-200 dark:bg-night-700 animate-pulse" />
			</div>
			<div className="h-4 w-16 rounded bg-stone-200 dark:bg-night-700 animate-pulse" />
		</div>
	);
}

// ============================================
// Main Component
// ============================================

export interface ServicesHealthCardProps {
	/** API base URL */
	apiBaseUrl?: string;
	/** Polling interval in ms (default: 30000) */
	pollingInterval?: number;
	/** Show compact version */
	compact?: boolean;
	/** Additional class names */
	className?: string;
}

export function ServicesHealthCard({
	apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
	pollingInterval = 30000,
	compact = false,
	className,
}: ServicesHealthCardProps) {
	const { data, isLoading, error } = useQuery<HealthResponse>({
		queryKey: ["system-health"],
		queryFn: async () => {
			const response = await fetch(`${apiBaseUrl}/api/system/health`);
			if (!response.ok) {
				throw new Error(`Health check failed: ${response.status}`);
			}
			return response.json();
		},
		refetchInterval: pollingInterval,
		staleTime: pollingInterval / 2,
	});

	const services = [
		{ name: "database", label: "Database (Turso)" },
		{ name: "helix", label: "Memory (HelixDB)" },
		{ name: "broker", label: "Broker (Alpaca)" },
		{ name: "marketdata", label: "Market Data (Polygon)" },
		{ name: "execution", label: "Execution Engine" },
	] as const;

	if (error) {
		return (
			<Card elevation={1} padding="md" className={className}>
				<div className="flex items-center gap-2 text-red-600 dark:text-red-400">
					<StatusDot status="error" size="sm" />
					<span className="text-sm font-medium">Health check unavailable</span>
				</div>
			</Card>
		);
	}

	return (
		<Card elevation={1} padding="md" className={className}>
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-semibold text-stone-700 dark:text-night-200 uppercase tracking-wider">
					System Health
				</h3>
				{data && (
					<span className="text-xs text-stone-500 dark:text-night-400 font-mono">
						v{data.version}
					</span>
				)}
			</div>

			{isLoading ? (
				<div className="space-y-0">
					{services.map((s) => (
						<SkeletonRow key={s.name} />
					))}
				</div>
			) : data ? (
				<>
					{!compact && <OverallStatusBanner status={data.status} />}
					<div className="space-y-0">
						{services.map((s) => (
							<ServiceRow key={s.name} label={s.label} health={data.services[s.name]} />
						))}
						{/* WebSocket row */}
						<div className="flex items-center justify-between py-2">
							<div className="flex items-center gap-2">
								<StatusDot
									status={serviceStatusToStatusDot(data.services.websocket.status)}
									size="sm"
									glow={data.services.websocket.status === "ok"}
								/>
								<span className="text-sm font-medium text-stone-700 dark:text-night-200">
									WebSocket
								</span>
							</div>
							<div className="flex items-center gap-3">
								<span className="text-xs font-mono text-stone-500 dark:text-night-400">
									{data.services.websocket.connections} conn
								</span>
								<span
									className={cn(
										"text-xs font-medium",
										data.services.websocket.status === "ok" && "text-green-600 dark:text-green-400",
										data.services.websocket.status === "degraded" &&
											"text-amber-600 dark:text-amber-400",
										data.services.websocket.status === "error" && "text-red-600 dark:text-red-400"
									)}
								>
									{data.services.websocket.status === "ok" ? "Healthy" : "Unhealthy"}
								</span>
							</div>
						</div>
					</div>
				</>
			) : null}
		</Card>
	);
}

export default ServicesHealthCard;
