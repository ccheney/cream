/**
 * Account Streaming Hook
 *
 * Listens for real-time account updates via WebSocket and merges
 * with initial REST data to provide live account state.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.3
 */

import { useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

// ============================================
// Types
// ============================================

export interface AccountStreamingState {
	/** Current cash balance */
	cash: number;
	/** Current equity value */
	equity: number;
	/** Available buying power */
	buyingPower: number;
	/** Today's P&L (equity change from previous close) */
	dayPnl: number;
	/** Today's P&L percentage */
	dayPnlPct: number;
	/** Whether receiving streaming updates */
	isStreaming: boolean;
	/** Last update timestamp */
	lastUpdated: Date | null;
}

interface AccountUpdateData {
	cash: number;
	equity: number;
	buyingPower: number;
	timestamp: string;
}

interface AccountUpdateMessage {
	type: "account_update";
	data: AccountUpdateData;
}

function calculateDayPnl(
	currentEquity: number,
	lastEquity?: number,
): { dayPnl: number; dayPnlPct: number } {
	if (!lastEquity) {
		return { dayPnl: 0, dayPnlPct: 0 };
	}
	const dayPnl = currentEquity - lastEquity;
	return { dayPnl, dayPnlPct: (dayPnl / lastEquity) * 100 };
}

function toAccountState(
	initialAccount: Account | undefined,
	streamingData: AccountUpdateData | null,
	lastUpdated: Date | null,
): AccountStreamingState {
	const equity = streamingData?.equity ?? initialAccount?.equity ?? 0;
	const { dayPnl, dayPnlPct } = calculateDayPnl(equity, initialAccount?.lastEquity);

	return {
		cash: streamingData?.cash ?? initialAccount?.cash ?? 0,
		equity,
		buyingPower: streamingData?.buyingPower ?? initialAccount?.buyingPower ?? 0,
		dayPnl,
		dayPnlPct,
		isStreaming: streamingData !== null,
		lastUpdated,
	};
}

function usePortfolioChannelSubscription(
	connected: boolean,
	subscribe: (channels: string[]) => void,
): void {
	useEffect(() => {
		if (connected) {
			subscribe(["portfolio"]);
		}
	}, [connected, subscribe]);
}

function useStreamingAccountData(lastMessage: unknown) {
	const [streamingData, setStreamingData] = useState<AccountUpdateData | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	useEffect(() => {
		if (!lastMessage) {
			return;
		}
		const message = lastMessage as AccountUpdateMessage;
		if (message.type === "account_update" && message.data) {
			setStreamingData(message.data);
			setLastUpdated(new Date());
		}
	}, [lastMessage]);

	return { streamingData, lastUpdated };
}

// ============================================
// Hook
// ============================================

/**
 * Hook to subscribe to real-time account updates.
 *
 * @param initialAccount - Initial account data from REST API (provides lastEquity for P&L calc)
 * @returns AccountStreamingState with live account metrics
 *
 * @example
 * ```tsx
 * const { data: account } = useAccount();
 * const streamingAccount = useAccountStreaming(account);
 *
 * return (
 *   <AccountSummary
 *     equity={streamingAccount.equity}
 *     dayPnl={streamingAccount.dayPnl}
 *     isLive={streamingAccount.isStreaming}
 *   />
 * );
 * ```
 */
export function useAccountStreaming(initialAccount?: Account): AccountStreamingState {
	const { lastMessage, connected, subscribe } = useWebSocketContext();
	usePortfolioChannelSubscription(connected, subscribe);

	const { streamingData, lastUpdated } = useStreamingAccountData(lastMessage);

	return useMemo(
		() => toAccountState(initialAccount, streamingData, lastUpdated),
		[initialAccount, streamingData, lastUpdated],
	);
}

export default useAccountStreaming;
