/**
 * Connection Status Indicator
 *
 * Visual indicator showing WebSocket/SSE connection status
 * with retry countdown and manual retry button.
 *
 * @see docs/plans/ui/31-realtime-patterns.md
 */

"use client";

import type { ConnectionState } from "@/hooks/use-connection-recovery";
import { useConnectionStatus, useWSStore } from "@/stores/websocket";

export interface ConnectionStatusProps {
	/** Connection state override (uses WebSocket store if not provided) */
	state?: ConnectionState;
	/** Retry countdown in ms */
	retryCountdown?: number | null;
	/** Current retry attempt */
	retryAttempt?: number;
	/** Manual retry handler */
	onRetry?: () => void;
	/** Show detailed status */
	detailed?: boolean;
	/** Compact mode (just the dot) */
	compact?: boolean;
}

interface StatusDotProps {
	color: "green" | "yellow" | "red" | "gray";
	pulse?: boolean;
}

function StatusDot({ color, pulse }: StatusDotProps) {
	const colorClasses = {
		green: "bg-profit",
		yellow: "bg-neutral",
		red: "bg-loss",
		gray: "bg-text-muted",
	};

	const glowClasses = {
		green: "glow-success",
		yellow: "glow-neutral",
		red: "glow-critical",
		gray: "",
	};

	return (
		<span
			className={`
        inline-block w-2 h-2 rounded-full
        ${colorClasses[color]}
        ${pulse ? "animate-pulse" : ""}
        ${glowClasses[color]}
      `}
			aria-hidden="true"
		/>
	);
}

export function ConnectionStatus({
	state: stateProp,
	retryCountdown,
	retryAttempt = 0,
	onRetry,
	detailed = false,
	compact = false,
}: ConnectionStatusProps) {
	const wsStatus = useConnectionStatus();
	const wsState = useWSStore((s) => ({
		reconnectAttempts: s.reconnectAttempts,
		lastError: s.lastError,
	}));

	const state: ConnectionState = stateProp || (wsStatus as ConnectionState);
	const attempt = retryAttempt || wsState.reconnectAttempts;

	function getStatusInfo() {
		switch (state) {
			case "connected":
				return {
					text: "Live",
					color: "green" as const,
					pulse: false,
					ariaLabel: "Live connection",
				};
			case "connecting":
				return {
					text: "Connecting...",
					color: "yellow" as const,
					pulse: true,
					ariaLabel: "Connecting to server",
				};
			case "reconnecting":
				return {
					text: `Reconnecting${attempt > 0 ? ` (${attempt})` : ""}...`,
					color: "yellow" as const,
					pulse: true,
					ariaLabel: `Reconnecting, attempt ${attempt}`,
				};
			case "disconnected":
				return {
					text: "Disconnected",
					color: "gray" as const,
					pulse: false,
					ariaLabel: "Disconnected from server",
				};
			case "error":
				return {
					text: "Connection Error",
					color: "red" as const,
					pulse: false,
					ariaLabel: "Connection error",
				};
			case "offline":
				return {
					text: "Offline",
					color: "red" as const,
					pulse: false,
					ariaLabel: "Network offline",
				};
			default:
				return {
					text: "Unknown",
					color: "gray" as const,
					pulse: false,
					ariaLabel: "Unknown connection state",
				};
		}
	}

	const status = getStatusInfo();
	const countdownSeconds = retryCountdown != null ? Math.ceil(retryCountdown / 1000) : null;

	if (compact) {
		return (
			<output
				className="inline-flex items-center"
				title={status.text}
				aria-label={status.ariaLabel}
			>
				<StatusDot color={status.color} pulse={status.pulse} />
			</output>
		);
	}

	return (
		<output
			className="inline-flex items-center gap-2"
			aria-live="polite"
			aria-label={status.ariaLabel}
		>
			<StatusDot color={status.color} pulse={status.pulse} />
			<span className="text-xs text-text-secondary">{status.text}</span>

			{countdownSeconds !== null && countdownSeconds > 0 && (
				<span className="text-xs text-text-muted">(retrying in {countdownSeconds}s)</span>
			)}

			{(state === "error" || state === "disconnected") && onRetry && (
				<button
					type="button"
					onClick={onRetry}
					className="
            text-xs text-primary
            hover:text-primary-hover
            underline underline-offset-2
            hover:no-underline
            transition-colors duration-150
          "
				>
					Retry now
				</button>
			)}

			{detailed && wsState.lastError && (
				<span className="text-xs text-text-muted" title={wsState.lastError.message}>
					({wsState.lastError.name})
				</span>
			)}
		</output>
	);
}

export interface ConnectionBannerProps {
	/** Connection state */
	state: ConnectionState;
	/** Error message */
	errorMessage?: string;
	/** Retry countdown in ms */
	retryCountdown?: number | null;
	/** Manual retry handler */
	onRetry?: () => void;
	/** Dismiss handler */
	onDismiss?: () => void;
}

export function ConnectionBanner({
	state,
	errorMessage,
	retryCountdown,
	onRetry,
	onDismiss,
}: ConnectionBannerProps) {
	if (state === "connected" || state === "connecting") {
		return null;
	}

	const countdownSeconds = retryCountdown != null ? Math.ceil(retryCountdown / 1000) : null;

	const isReconnecting = state === "reconnecting";
	const bgColor = isReconnecting ? "bg-neutral/20" : "bg-loss/20";
	const borderColor = isReconnecting ? "border-neutral" : "border-loss";
	const textColor = isReconnecting ? "text-neutral" : "text-loss";

	return (
		<div
			role="alert"
			aria-live="assertive"
			className={`
        w-full px-4 py-2
        ${bgColor}
        border-b ${borderColor}
        flex items-center justify-between gap-4
      `}
		>
			<div className="flex items-center gap-2">
				<svg
					className={`h-4 w-4 ${textColor}`}
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={2}
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
					/>
				</svg>

				<span className={`text-sm ${textColor}`}>
					{isReconnecting
						? `Reconnecting...${countdownSeconds ? ` (${countdownSeconds}s)` : ""}`
						: errorMessage || "Connection lost"}
				</span>
			</div>

			<div className="flex items-center gap-2">
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className={`
              px-2 py-1
              text-xs font-medium
              ${textColor}
              hover:bg-white/10
              rounded
              transition-colors duration-150
            `}
					>
						Retry Now
					</button>
				)}

				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						className="p-1 text-text-muted hover:text-text-primary transition-colors"
						aria-label="Dismiss"
					>
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={2}
							stroke="currentColor"
							aria-hidden="true"
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}

export default ConnectionStatus;
