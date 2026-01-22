import { useCallback, useEffect, useRef, useState } from "react";
import { classifyTradeSide, type Trade } from "@/components/ui/trade-tape";

export interface RawTradeMessage {
	ev: "T";
	sym: string;
	p: number;
	s: number;
	x?: number;
	c?: number[];
	t: number;
	i?: string;
}

export interface UseTradeStreamOptions {
	/** Trading symbol to stream */
	symbol: string;
	/** Maximum trades to keep in memory */
	maxTrades?: number;
	/** Whether to connect to WebSocket */
	enabled?: boolean;
}

export interface UseTradeStreamReturn {
	/** Array of trades (most recent last) */
	trades: Trade[];
	/** Whether connected to WebSocket */
	isConnected: boolean;
	/** Whether currently loading */
	isLoading: boolean;
	/** Any error that occurred */
	error: Error | null;
	/** Clear all trades */
	clearTrades: () => void;
	/** Manually add a trade (for testing) */
	addTrade: (trade: Trade) => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_TRADES = 500;

// ============================================
// Hook Implementation
// ============================================

/**
 * useTradeStream provides real-time trade data streaming.
 *
 * Connects to the dashboard-api WebSocket and accumulates
 * trade messages for the TradeTape component.
 *
 * @example
 * ```tsx
 * const { trades, isConnected, isLoading, error } = useTradeStream({
 *   symbol: 'AAPL',
 *   maxTrades: 500,
 * });
 * ```
 */
export function useTradeStream({
	symbol,
	maxTrades = DEFAULT_MAX_TRADES,
	enabled = true,
}: UseTradeStreamOptions): UseTradeStreamReturn {
	const [trades, setTrades] = useState<Trade[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const tradeIdCounter = useRef(0);

	/**
	 * Convert raw WebSocket message to Trade object.
	 */
	const parseTradeMessage = useCallback(
		(raw: RawTradeMessage): Trade => {
			const id = raw.i ?? `${symbol}-${tradeIdCounter.current++}`;

			return {
				id,
				symbol: raw.sym.toUpperCase(),
				price: raw.p,
				size: raw.s,
				side: classifyTradeSide(raw.c),
				exchange: raw.x,
				conditions: raw.c,
				timestamp: new Date(raw.t / 1e6), // Nanoseconds to milliseconds
			};
		},
		[symbol],
	);

	/**
	 * Add a new trade to the list with memory management.
	 */
	const addTrade = useCallback(
		(trade: Trade) => {
			setTrades((prev) => {
				const next = [...prev, trade];
				// Keep only the last maxTrades
				if (next.length > maxTrades) {
					return next.slice(-maxTrades);
				}
				return next;
			});
		},
		[maxTrades],
	);

	/**
	 * Clear all trades.
	 */
	const clearTrades = useCallback(() => {
		setTrades([]);
	}, []);

	/**
	 * Connect to WebSocket and subscribe to trades.
	 */
	useEffect(() => {
		if (!enabled || !symbol) {
			return;
		}

		const upperSymbol = symbol.toUpperCase();
		setIsLoading(true);
		setError(null);

		// Get WebSocket URL from environment or default
		const wsUrl =
			process.env.NEXT_PUBLIC_WS_URL ??
			(typeof window !== "undefined"
				? `ws://${window.location.host}/ws`
				: "ws://localhost:3001/ws");

		try {
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				setIsConnected(true);
				setIsLoading(false);
				setError(null);

				// Subscribe to trades for the symbol
				ws.send(
					JSON.stringify({
						type: "subscribe",
						channel: "trades",
						symbol: upperSymbol,
					}),
				);
			};

			ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data);

					// Handle trade messages
					if (message.type === "trade" && message.data?.sym?.toUpperCase() === upperSymbol) {
						const trade = parseTradeMessage(message.data);
						addTrade(trade);
					}
				} catch {
					// Ignore parse errors for non-JSON messages
				}
			};

			ws.onerror = () => {
				setError(new Error("WebSocket connection error"));
				setIsConnected(false);
			};

			ws.onclose = () => {
				setIsConnected(false);
				setIsLoading(false);
			};
		} catch (err) {
			setError(err instanceof Error ? err : new Error("Failed to connect"));
			setIsLoading(false);
		}

		return () => {
			if (wsRef.current) {
				// Unsubscribe before closing
				if (wsRef.current.readyState === WebSocket.OPEN) {
					wsRef.current.send(
						JSON.stringify({
							type: "unsubscribe",
							channel: "trades",
							symbol: upperSymbol,
						}),
					);
				}
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [enabled, symbol, parseTradeMessage, addTrade]);

	// Clear trades when symbol changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: symbol change should trigger clear
	useEffect(() => {
		clearTrades();
	}, [symbol, clearTrades]);

	return {
		trades,
		isConnected,
		isLoading,
		error,
		clearTrades,
		addTrade,
	};
}

export default useTradeStream;
