/** @see docs/plans/ui/40-streaming-data-integration.md Part 4.1 */
"use client";

import { type ReactNode, useMemo } from "react";
import { useStreamingMetrics } from "@/hooks/useStreamingMetrics";
import type { HealthStatus } from "@/stores/streaming-metrics-store";

export interface StreamingStatusProps {
	/** Display variant */
	variant?: "full" | "compact";
	/** Show options WebSocket status */
	showOptions?: boolean;
}

interface StatusDotProps {
	status: HealthStatus | "connecting";
}

function StatusDot({ status }: StatusDotProps) {
	const colorClasses = {
		healthy: "bg-profit",
		degraded: "bg-neutral",
		disconnected: "bg-loss",
		connecting: "bg-neutral",
	};

	const glowClasses = {
		healthy: "shadow-[0_0_4px_theme(colors.profit)]",
		degraded: "shadow-[0_0_4px_theme(colors.neutral)]",
		disconnected: "shadow-[0_0_4px_theme(colors.loss)]",
		connecting: "shadow-[0_0_4px_theme(colors.neutral)]",
	};

	const isPulsing = status === "connecting" || status === "degraded";

	return (
		<span
			className={`
        inline-block w-2 h-2 rounded-full
        ${colorClasses[status]}
        ${glowClasses[status]}
        ${isPulsing ? "animate-pulse" : ""}
      `}
			aria-hidden="true"
		/>
	);
}

interface ConnectionRowProps {
	label: string;
	connected: boolean;
	count: number;
	countLabel: string;
	quotesPerMinute: number;
	healthStatus: HealthStatus;
}

function ConnectionRow({
	label,
	connected,
	count,
	countLabel,
	quotesPerMinute,
	healthStatus,
}: ConnectionRowProps) {
	const status = connected ? healthStatus : "disconnected";

	return (
		<div className="flex items-center justify-between gap-4 text-xs">
			<div className="flex items-center gap-2 min-w-0">
				<StatusDot status={status} />
				<span className="text-text-secondary truncate">{label}</span>
			</div>
			<div className="flex items-center gap-4 text-text-muted">
				<span>{connected ? "Connected" : "Disconnected"}</span>
				<span>
					{countLabel}: {count}
				</span>
				<span>
					Quotes: {quotesPerMinute.toLocaleString()}
					/min
				</span>
			</div>
		</div>
	);
}

function formatLatency(ms: number): string {
	if (ms < 1) {
		return "<1ms";
	}
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimeAgo(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms ago`;
	}
	if (ms < 60000) {
		return `${Math.round(ms / 1000)}s ago`;
	}
	return `${Math.round(ms / 60000)}m ago`;
}

interface CompactStatusProps {
	stocksConnected: boolean;
	symbolCount: number;
	quotesPerMinute: number;
	avgLatency: number;
	displayStatus: HealthStatus | "connecting";
}

function CompactStatus({
	stocksConnected,
	symbolCount,
	quotesPerMinute,
	avgLatency,
	displayStatus,
}: CompactStatusProps) {
	const tooltipText = stocksConnected
		? `Streaming: ${symbolCount} symbols, ${quotesPerMinute}/min, ${formatLatency(avgLatency)} avg`
		: "Streaming: Disconnected";

	return (
		<output
			className="inline-flex items-center gap-1.5"
			title={tooltipText}
			aria-label={tooltipText}
		>
			<StatusDot status={displayStatus} />
			<span className="text-xs text-text-muted">
				{stocksConnected ? `${quotesPerMinute.toLocaleString()}/min` : "Offline"}
			</span>
		</output>
	);
}

interface FullStatusLayoutProps {
	isReconnecting: boolean;
	reconnectAttempts: number;
	reconnectData: {
		healthStatus: HealthStatus;
		quotesPerMinute: number;
		stocksConnected: boolean;
		optionsConnected: boolean;
		symbolCount: number;
		contractCount: number;
		optionsQuotesPerMinute: number;
		reconnectMessage: ReactNode;
	};
	children: ReactNode;
}

function StreamingStatusLayout({
	isReconnecting,
	reconnectAttempts,
	reconnectData,
	children,
}: FullStatusLayoutProps) {
	return (
		<section className="rounded-md border border-border bg-surface-secondary p-3">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-medium text-text-primary">Streaming Status</h3>
				{isReconnecting && reconnectAttempts > 0 && (
					<span className="text-xs text-neutral animate-pulse">
						Reconnecting ({reconnectAttempts})...
					</span>
				)}
			</div>

			<div className="space-y-2">
				<ConnectionRow
					label="Stocks WebSocket"
					connected={reconnectData.stocksConnected}
					count={reconnectData.symbolCount}
					countLabel="Symbols"
					quotesPerMinute={reconnectData.quotesPerMinute}
					healthStatus={reconnectData.healthStatus}
				/>
				{children}
			</div>

			{(reconnectData.stocksConnected || reconnectData.optionsConnected) && (
				<div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50 text-xs text-text-muted">
					{reconnectData.reconnectMessage}
				</div>
			)}
		</section>
	);
}

function useStreamingStatusRows({
	showOptions,
	healthStatus,
	optionsConnected,
	contractCount,
	quotesPerMinute: _quotesPerMinute,
	optionsQuotesPerMinute,
	stocksConnected,
	reconnectAttempts,
	lastMessageAgo,
	avgLatency,
	connectionState,
}: {
	showOptions: boolean;
	healthStatus: HealthStatus;
	optionsConnected: boolean;
	contractCount: number;
	quotesPerMinute: number;
	optionsQuotesPerMinute: number;
	stocksConnected: boolean;
	reconnectAttempts: number;
	lastMessageAgo: number;
	avgLatency: number;
	connectionState: string;
}) {
	const isConnecting = connectionState === "connecting";
	const isReconnecting = connectionState === "reconnecting";
	const displayStatus: HealthStatus | "connecting" =
		isConnecting || isReconnecting ? "connecting" : healthStatus;

	const optionsRow = useMemo(() => {
		if (!showOptions) {
			return null;
		}

		return (
			<ConnectionRow
				label="Options WebSocket"
				connected={optionsConnected}
				count={contractCount}
				countLabel="Contracts"
				quotesPerMinute={optionsQuotesPerMinute}
				healthStatus={healthStatus}
			/>
		);
	}, [contractCount, healthStatus, optionsConnected, optionsQuotesPerMinute, showOptions]);

	const reconnectMessage = useMemo(() => {
		if (!(stocksConnected || optionsConnected)) {
			return null;
		}

		return (
			<>
				<span>Last Message: {lastMessageAgo > 0 ? formatTimeAgo(lastMessageAgo) : "-"}</span>
				<span>Latency: {avgLatency > 0 ? formatLatency(avgLatency) : "-"} avg</span>
			</>
		);
	}, [avgLatency, lastMessageAgo, optionsConnected, stocksConnected]);

	return {
		isReconnecting,
		reconnectAttempts,
		displayStatus,
		optionsRow,
		reconnectMessage,
		isConnecting,
	};
}

interface StreamingData {
	stocksConnected: boolean;
	optionsConnected: boolean;
	symbolCount: number;
	contractCount: number;
	quotesPerMinute: number;
	optionsQuotesPerMinute: number;
	lastMessageAgo: number;
	avgLatency: number;
	reconnectAttempts: number;
	healthStatus: HealthStatus;
	connectionState: string;
}

function useStreamingStatusData(): StreamingData {
	const {
		stocksConnected,
		optionsConnected,
		symbolCount,
		contractCount,
		quotesPerMinute,
		optionsQuotesPerMinute,
		lastMessageAgo,
		avgLatency,
		reconnectAttempts,
		healthStatus,
		connectionState,
	} = useStreamingMetrics();

	return {
		stocksConnected,
		optionsConnected,
		symbolCount,
		contractCount,
		quotesPerMinute,
		optionsQuotesPerMinute,
		lastMessageAgo,
		avgLatency,
		reconnectAttempts,
		healthStatus,
		connectionState,
	};
}

export function StreamingStatus({ variant = "full", showOptions = true }: StreamingStatusProps) {
	const metrics = useStreamingStatusData();
	const { isReconnecting, reconnectAttempts, optionsRow, reconnectMessage, displayStatus } =
		useStreamingStatusRows({
			showOptions,
			healthStatus: metrics.healthStatus,
			optionsConnected: metrics.optionsConnected,
			contractCount: metrics.contractCount,
			optionsQuotesPerMinute: metrics.optionsQuotesPerMinute,
			stocksConnected: metrics.stocksConnected,
			quotesPerMinute: metrics.quotesPerMinute,
			reconnectAttempts: metrics.reconnectAttempts,
			lastMessageAgo: metrics.lastMessageAgo,
			avgLatency: metrics.avgLatency,
			connectionState: metrics.connectionState,
		});

	if (variant === "compact") {
		return (
			<CompactStatus
				stocksConnected={metrics.stocksConnected}
				symbolCount={metrics.symbolCount}
				quotesPerMinute={metrics.quotesPerMinute}
				avgLatency={metrics.avgLatency}
				displayStatus={displayStatus}
			/>
		);
	}

	return (
		<StreamingStatusLayout
			isReconnecting={isReconnecting}
			reconnectAttempts={reconnectAttempts}
			reconnectData={{
				healthStatus: metrics.healthStatus,
				stocksConnected: metrics.stocksConnected,
				optionsConnected: metrics.optionsConnected,
				symbolCount: metrics.symbolCount,
				contractCount: metrics.contractCount,
				quotesPerMinute: metrics.quotesPerMinute,
				optionsQuotesPerMinute: metrics.optionsQuotesPerMinute,
				reconnectMessage,
			}}
		>
			{optionsRow}
		</StreamingStatusLayout>
	);
}

export default StreamingStatus;
