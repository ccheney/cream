/**
 * Portfolio Tool
 *
 * Get current portfolio state using gRPC ExecutionService or Alpaca broker client.
 */

import type { Position as BrokerPosition } from "@cream/broker";
import { type ExecutionContext, isTest } from "@cream/domain";
import { GrpcError } from "@cream/domain/grpc";
import { getBrokerClient, getExecutionClient } from "../clients.js";
import type {
	EnrichedPortfolioStateResponse,
	PdtStatus,
	PortfolioPosition,
	PortfolioStateResponse,
} from "../types.js";
import { enrichPositions } from "./positionEnrichment.js";

/**
 * Get current portfolio state
 *
 * Priority order:
 * 1. gRPC ExecutionService (when Rust backend is running)
 * 2. Alpaca broker client (direct API access)
 *
 * @param ctx - ExecutionContext
 * @returns Portfolio state including positions and buying power
 * @throws Error if gRPC call fails and broker is unavailable, or in test mode
 */
export async function getPortfolioState(ctx: ExecutionContext): Promise<PortfolioStateResponse> {
	if (isTest(ctx)) {
		throw new Error("getPortfolioState is not available in test mode");
	}

	// Try gRPC first
	try {
		const client = getExecutionClient();

		// Fetch account state and positions in parallel
		const [accountResponse, positionsResponse] = await Promise.all([
			client.getAccountState(),
			client.getPositions(),
		]);

		const accountState = accountResponse.data.accountState;
		const positions = positionsResponse.data.positions ?? [];

		// Calculate total unrealized P&L
		let totalPnL = 0;
		const mappedPositions: PortfolioPosition[] = positions.map((pos) => {
			totalPnL += pos.unrealizedPnl ?? 0;
			return {
				symbol: pos.instrument?.instrumentId ?? "",
				quantity: pos.quantity,
				averageCost: pos.avgEntryPrice,
				marketValue: pos.marketValue,
				unrealizedPnL: pos.unrealizedPnl ?? 0,
			};
		});

		// Build PDT status from account state
		const pdt: PdtStatus = {
			dayTradeCount: accountState?.dayTradeCount ?? 0,
			remainingDayTrades: accountState?.remainingDayTrades ?? -1,
			isPatternDayTrader: accountState?.isPdtRestricted ?? false,
			isUnderThreshold: accountState?.underPdtThreshold ?? false,
			lastEquity: accountState?.lastEquity ?? 0,
			daytradingBuyingPower: accountState?.daytradingBuyingPower ?? 0,
		};

		return {
			positions: mappedPositions,
			buyingPower: accountState?.buyingPower ?? 0,
			totalEquity: accountState?.equity ?? 0,
			dayPnL: 0, // Would need day P&L tracking in account state
			totalPnL,
			pdt,
		};
	} catch (error) {
		// gRPC failed - try broker client as fallback
		if (error instanceof GrpcError && error.code === "UNAVAILABLE") {
			return getPortfolioStateFromBroker(ctx);
		}
		throw error;
	}
}

/**
 * Get portfolio state directly from Alpaca broker API
 * @throws Error if broker credentials are not configured or API call fails
 */
async function getPortfolioStateFromBroker(ctx: ExecutionContext): Promise<PortfolioStateResponse> {
	const client = getBrokerClient(ctx);
	if (!client) {
		throw new Error("Broker credentials not configured (ALPACA_KEY, ALPACA_SECRET required)");
	}

	// Fetch account and positions in parallel
	const [account, positions] = await Promise.all([client.getAccount(), client.getPositions()]);

	// Map positions to our format
	let totalPnL = 0;
	const mappedPositions: PortfolioPosition[] = positions.map((pos: BrokerPosition) => {
		const unrealizedPnL = pos.unrealizedPl;
		totalPnL += unrealizedPnL;
		return {
			symbol: pos.symbol,
			quantity: pos.qty,
			averageCost: pos.avgEntryPrice,
			marketValue: pos.marketValue,
			unrealizedPnL,
		};
	});

	// PDT threshold constant from FINRA rules
	const PDT_EQUITY_THRESHOLD = 25_000;
	const MAX_DAY_TRADES = 3;

	const isUnderThreshold = account.lastEquity < PDT_EQUITY_THRESHOLD;
	const remainingDayTrades = isUnderThreshold
		? Math.max(0, MAX_DAY_TRADES - account.daytradeCount)
		: -1; // Unlimited when above threshold

	// Build PDT status from broker account data
	const pdt: PdtStatus = {
		dayTradeCount: account.daytradeCount,
		remainingDayTrades,
		isPatternDayTrader: account.patternDayTrader,
		isUnderThreshold,
		lastEquity: account.lastEquity,
		daytradingBuyingPower: account.daytradingBuyingPower,
	};

	return {
		positions: mappedPositions,
		buyingPower: account.buyingPower,
		totalEquity: account.equity,
		dayPnL: account.equity - account.lastEquity,
		totalPnL,
		pdt,
	};
}

/**
 * Get enriched portfolio state with strategy, risk, and thesis metadata
 *
 * This extends getPortfolioState by joining position data with decisions and thesis_state
 * tables to provide full context for each position including:
 * - Strategy metadata (strategyFamily, timeHorizon, confidence/risk scores)
 * - Risk parameters (stopPrice, targetPrice, entryPrice)
 * - Thesis context (entryThesis, invalidationConditions, conviction)
 * - Position age (openedAt, holdingDays)
 *
 * @param ctx - ExecutionContext
 * @returns Enriched portfolio state with full position metadata
 * @throws Error if gRPC/broker unavailable or in test mode
 */
export async function getEnrichedPortfolioState(
	ctx: ExecutionContext,
): Promise<EnrichedPortfolioStateResponse> {
	const baseState = await getPortfolioState(ctx);

	const enrichedPositions = await enrichPositions(baseState.positions, ctx);

	return {
		positions: enrichedPositions,
		buyingPower: baseState.buyingPower,
		totalEquity: baseState.totalEquity,
		dayPnL: baseState.dayPnL,
		totalPnL: baseState.totalPnL,
		pdt: baseState.pdt,
	};
}
