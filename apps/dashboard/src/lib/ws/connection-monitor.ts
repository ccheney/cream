/**
 * @see docs/plans/ui/28-states.md lines 89-96
 */

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting" | "failed";

export interface ConnectionMonitorOptions {
	/** Initial backoff delay in ms (default: 1000) */
	initialBackoff?: number;
	/** Maximum backoff delay in ms (default: 32000) */
	maxBackoff?: number;
	/** Backoff multiplier (default: 2) */
	backoffMultiplier?: number;
	/** Maximum reconnection attempts (default: 10) */
	maxRetries?: number;
	/** Callback when status changes */
	onStatusChange?: (status: ConnectionStatus, retryCount: number) => void;
	/** Callback when reconnection succeeds */
	onReconnectSuccess?: () => void;
	/** Callback when reconnection fails (max retries reached) */
	onReconnectFailed?: () => void;
}

export interface ConnectionMonitorState {
	status: ConnectionStatus;
	retryCount: number;
	nextRetryIn: number;
	lastDisconnectedAt: Date | null;
}

export const DEFAULT_OPTIONS: Required<
	Omit<ConnectionMonitorOptions, "onStatusChange" | "onReconnectSuccess" | "onReconnectFailed">
> = {
	initialBackoff: 1000,
	maxBackoff: 32000,
	backoffMultiplier: 2,
	maxRetries: 10,
};

export function calculateBackoff(
	retryCount: number,
	initialBackoff: number = DEFAULT_OPTIONS.initialBackoff,
	maxBackoff: number = DEFAULT_OPTIONS.maxBackoff,
	multiplier: number = DEFAULT_OPTIONS.backoffMultiplier
): number {
	const delay = initialBackoff * multiplier ** retryCount;
	return Math.min(delay, maxBackoff);
}

/**
 * Generate backoff sequence for given options.
 *
 * @param options - Connection monitor options
 * @returns Array of backoff delays in ms
 */
export function getBackoffSequence(options: Partial<ConnectionMonitorOptions> = {}): number[] {
	const {
		initialBackoff = DEFAULT_OPTIONS.initialBackoff,
		maxBackoff = DEFAULT_OPTIONS.maxBackoff,
		backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
		maxRetries = DEFAULT_OPTIONS.maxRetries,
	} = options;

	const sequence: number[] = [];
	for (let i = 0; i < maxRetries; i++) {
		sequence.push(calculateBackoff(i, initialBackoff, maxBackoff, backoffMultiplier));
	}
	return sequence;
}

// ============================================
// Connection Monitor Class
// ============================================

/**
 * WebSocket connection monitor with exponential backoff.
 *
 * @example
 * ```ts
 * const monitor = new ConnectionMonitor({
 *   onStatusChange: (status) => setConnectionStatus(status),
 *   onReconnectSuccess: () => toast.success("Connected!"),
 *   onReconnectFailed: () => toast.error("Connection failed"),
 * });
 *
 * // Call when WebSocket connects
 * monitor.onConnected();
 *
 * // Call when WebSocket disconnects
 * monitor.onDisconnected();
 *
 * // Manual reconnect
 * monitor.manualReconnect();
 * ```
 */
export class ConnectionMonitor {
	private options: Required<
		Omit<ConnectionMonitorOptions, "onStatusChange" | "onReconnectSuccess" | "onReconnectFailed">
	> &
		Pick<ConnectionMonitorOptions, "onStatusChange" | "onReconnectSuccess" | "onReconnectFailed">;

	private _status: ConnectionStatus = "disconnected";
	private _retryCount = 0;
	private _nextRetryIn = 0;
	private _lastDisconnectedAt: Date | null = null;
	private retryTimeout: ReturnType<typeof setTimeout> | null = null;
	private countdownInterval: ReturnType<typeof setInterval> | null = null;

	constructor(options: ConnectionMonitorOptions = {}) {
		this.options = {
			...DEFAULT_OPTIONS,
			...options,
		};
	}

	// ---- Getters ----

	get status(): ConnectionStatus {
		return this._status;
	}

	get retryCount(): number {
		return this._retryCount;
	}

	get nextRetryIn(): number {
		return this._nextRetryIn;
	}

	get lastDisconnectedAt(): Date | null {
		return this._lastDisconnectedAt;
	}

	get state(): ConnectionMonitorState {
		return {
			status: this._status,
			retryCount: this._retryCount,
			nextRetryIn: this._nextRetryIn,
			lastDisconnectedAt: this._lastDisconnectedAt,
		};
	}

	// ---- Private Methods ----

	private setStatus(status: ConnectionStatus): void {
		this._status = status;
		this.options.onStatusChange?.(status, this._retryCount);
	}

	private clearTimers(): void {
		if (this.retryTimeout) {
			clearTimeout(this.retryTimeout);
			this.retryTimeout = null;
		}
		if (this.countdownInterval) {
			clearInterval(this.countdownInterval);
			this.countdownInterval = null;
		}
	}

	private startCountdown(delay: number, onComplete: () => void): void {
		this._nextRetryIn = delay;

		// Update countdown every second
		this.countdownInterval = setInterval(() => {
			this._nextRetryIn = Math.max(0, this._nextRetryIn - 1000);
			this.options.onStatusChange?.(this._status, this._retryCount);
		}, 1000);

		// Trigger reconnect attempt when countdown ends
		this.retryTimeout = setTimeout(() => {
			this.clearTimers();
			onComplete();
		}, delay);
	}

	// ---- Public Methods ----

	/**
	 * Call when WebSocket successfully connects.
	 */
	onConnected(): void {
		this.clearTimers();
		this._retryCount = 0;
		this._nextRetryIn = 0;
		this._lastDisconnectedAt = null;
		this.setStatus("connected");
		this.options.onReconnectSuccess?.();
	}

	/**
	 * Call when WebSocket disconnects.
	 * Starts automatic reconnection with exponential backoff.
	 */
	onDisconnected(): void {
		if (this._status === "connected") {
			this._lastDisconnectedAt = new Date();
		}

		this.clearTimers();
		this.setStatus("disconnected");

		// Start reconnection attempts
		this.scheduleReconnect();
	}

	/**
	 * Schedule next reconnection attempt.
	 */
	private scheduleReconnect(): void {
		if (this._retryCount >= this.options.maxRetries) {
			this.setStatus("failed");
			this.options.onReconnectFailed?.();
			return;
		}

		this.setStatus("reconnecting");

		const delay = calculateBackoff(
			this._retryCount,
			this.options.initialBackoff,
			this.options.maxBackoff,
			this.options.backoffMultiplier
		);

		this.startCountdown(delay, () => {
			this._retryCount++;
			// The actual reconnection is handled by the consumer
			// They should call onConnected() if successful, or wait for next attempt
		});
	}

	/**
	 * Manual reconnect - resets backoff and attempts immediately.
	 */
	manualReconnect(): void {
		this.clearTimers();
		this._retryCount = 0;
		this._nextRetryIn = 0;
		this.setStatus("reconnecting");
		// Consumer should attempt reconnection now
	}

	/**
	 * Cancel all reconnection attempts.
	 */
	cancel(): void {
		this.clearTimers();
		this._nextRetryIn = 0;
		this.setStatus("disconnected");
	}

	/**
	 * Reset monitor to initial state.
	 */
	reset(): void {
		this.clearTimers();
		this._status = "disconnected";
		this._retryCount = 0;
		this._nextRetryIn = 0;
		this._lastDisconnectedAt = null;
	}

	/**
	 * Clean up resources.
	 */
	destroy(): void {
		this.clearTimers();
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new connection monitor.
 */
export function createConnectionMonitor(options: ConnectionMonitorOptions = {}): ConnectionMonitor {
	return new ConnectionMonitor(options);
}

export default ConnectionMonitor;
