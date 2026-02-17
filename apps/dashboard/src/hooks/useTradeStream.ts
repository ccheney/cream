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

const DEFAULT_MAX_TRADES = 500;

function parseTradeMessage(raw: RawTradeMessage, symbol: string, tradeId: number): Trade {
	const id = raw.i ?? `${symbol}-${tradeId}`;
	return {
		id,
		symbol: raw.sym.toUpperCase(),
		price: raw.p,
		size: raw.s,
		side: classifyTradeSide(raw.c),
		exchange: raw.x,
		conditions: raw.c,
		timestamp: new Date(raw.t / 1e6),
	};
}

function getWebSocketUrl(): string {
	return (
		process.env.NEXT_PUBLIC_WS_URL ??
		(typeof window !== "undefined" ? `ws://${window.location.host}/ws` : "ws://localhost:3001/ws")
	);
}

function subscribe(ws: WebSocket, symbol: string): void {
	ws.send(
		JSON.stringify({
			type: "subscribe",
			channel: "trades",
			symbol,
		}),
	);
}

function unsubscribe(ws: WebSocket, symbol: string): void {
	ws.send(
		JSON.stringify({
			type: "unsubscribe",
			channel: "trades",
			symbol,
		}),
	);
}

interface SocketHandlers {
	onOpen: () => void;
	onTrade: (trade: RawTradeMessage) => void;
	onError: (error: Error) => void;
	onClose: () => void;
}

function createTradeSocket(symbol: string, handlers: SocketHandlers): WebSocket {
	const ws = new WebSocket(getWebSocketUrl());

	ws.onopen = () => {
		handlers.onOpen();
		subscribe(ws, symbol);
	};

	ws.onmessage = (event) => {
		try {
			const message = JSON.parse(event.data);
			if (message.type === "trade" && message.data?.sym?.toUpperCase() === symbol) {
				handlers.onTrade(message.data as RawTradeMessage);
			}
		} catch {
			// Ignore non-JSON messages.
		}
	};

	ws.onerror = () => {
		handlers.onError(new Error("WebSocket connection error"));
	};

	ws.onclose = () => {
		handlers.onClose();
	};

	return ws;
}

function closeTradeSocket(ws: WebSocket | null, symbol: string): void {
	if (!ws) {
		return;
	}
	if (ws.readyState === WebSocket.OPEN) {
		unsubscribe(ws, symbol);
	}
	ws.close();
}

function useTradeSocketConnection({
	addTrade,
	clearTrades,
	enabled,
	setError,
	setIsConnected,
	setIsLoading,
	symbol,
	tradeIdCounter,
	wsRef,
}: {
	addTrade: (trade: Trade) => void;
	clearTrades: () => void;
	enabled: boolean;
	setError: React.Dispatch<React.SetStateAction<Error | null>>;
	setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
	setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
	symbol: string;
	tradeIdCounter: React.MutableRefObject<number>;
	wsRef: React.MutableRefObject<WebSocket | null>;
}) {
	useEffect(() => {
		if (!enabled || !symbol) {
			return;
		}

		const upperSymbol = symbol.toUpperCase();
		clearTrades();
		setIsLoading(true);
		setError(null);

		try {
			wsRef.current = createTradeSocket(upperSymbol, {
				onOpen: () => {
					setIsConnected(true);
					setIsLoading(false);
					setError(null);
				},
				onTrade: (rawTrade) => {
					const nextTrade = parseTradeMessage(rawTrade, symbol, tradeIdCounter.current++);
					addTrade(nextTrade);
				},
				onError: (socketError) => {
					setError(socketError);
					setIsConnected(false);
				},
				onClose: () => {
					setIsConnected(false);
					setIsLoading(false);
				},
			});
		} catch (connectionError) {
			setError(connectionError instanceof Error ? connectionError : new Error("Failed to connect"));
			setIsLoading(false);
		}

		return () => {
			closeTradeSocket(wsRef.current, upperSymbol);
			wsRef.current = null;
		};
	}, [
		addTrade,
		clearTrades,
		enabled,
		setError,
		setIsConnected,
		setIsLoading,
		symbol,
		tradeIdCounter,
		wsRef,
	]);
}

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

	const addTrade = useCallback(
		(trade: Trade) => {
			setTrades((prev) => {
				const next = [...prev, trade];
				return next.length > maxTrades ? next.slice(-maxTrades) : next;
			});
		},
		[maxTrades],
	);

	const clearTrades = useCallback(() => {
		setTrades([]);
	}, []);

	useTradeSocketConnection({
		addTrade,
		clearTrades,
		enabled,
		setError,
		setIsConnected,
		setIsLoading,
		symbol,
		tradeIdCounter,
		wsRef,
	});

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
