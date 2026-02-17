/**
 * usePositionGreeks Hook
 *
 * Calculates greeks for options positions with streaming price updates.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.2
 */

"use client";

import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { OptionsPosition } from "@/hooks/queries/useOptionsPositions";
import { isOptionsMarketOpen } from "@/lib/market-hours";

export interface PositionGreeks {
	/** Delta: change in option price per $1 change in underlying */
	delta: number;
	/** Gamma: change in delta per $1 change in underlying */
	gamma: number;
	/** Theta: daily time decay */
	theta: number;
	/** Vega: change per 1% IV change */
	vega: number;
	/** Rho: change per 1% interest rate change */
	rho: number;
	/** Theoretical price */
	theoreticalPrice: number;
}

export interface StreamingOptionsPosition extends OptionsPosition {
	/** Live contract price */
	livePrice: number;
	/** Previous price (for flash animation) */
	previousPrice: number;
	/** Live unrealized P/L */
	liveUnrealizedPnl: number;
	/** Live unrealized P/L percentage */
	liveUnrealizedPnlPct: number;
	/** Calculated greeks */
	greeks: PositionGreeks;
	/** Whether streaming is active */
	isStreaming: boolean;
	/** Last update timestamp */
	lastUpdated: Date | null;
}

export interface AggregateGreeks {
	/** Delta-adjusted notional exposure */
	deltaNotional: number;
	/** Total gamma */
	totalGamma: number;
	/** Total daily theta decay */
	totalTheta: number;
	/** Total vega exposure */
	totalVega: number;
	/** Total rho exposure (per 1% rate change) */
	totalRho: number;
}

export interface UsePositionGreeksOptions {
	/** Options positions */
	positions: OptionsPosition[];
	/** Underlying prices by symbol */
	underlyingPrices: Record<string, number>;
	/** WebSocket message handler */
	onMessage?: (data: unknown) => void;
	/** Default IV if not provided (default: 0.30) */
	defaultIV?: number;
}

export interface UsePositionGreeksReturn {
	/** Positions with live greeks */
	streamingPositions: StreamingOptionsPosition[];
	/** Aggregated portfolio greeks */
	aggregateGreeks: AggregateGreeks;
	/** Whether any position is streaming */
	isStreaming: boolean;
	/** Update price for a contract */
	updateContractPrice: (symbol: string, price: number) => void;
	/** Update underlying price */
	updateUnderlyingPrice: (symbol: string, price: number) => void;
}

const DEFAULT_IV = 0.3;
const DEFAULT_RISK_FREE_RATE = 0.05;
const DAYS_PER_YEAR = 365;
const MULTIPLIER = 100;
/** Greeks recalculation interval in milliseconds */
const GREEKS_RECALC_INTERVAL_MS = 5000;

function normalCDF(x: number): number {
	const p = 0.2316419;
	const b1 = 0.31938153;
	const b2 = -0.356563782;
	const b3 = 1.781477937;
	const b4 = -1.821255978;
	const b5 = 1.330274429;

	const absX = Math.abs(x);
	const t = 1.0 / (1.0 + p * absX);
	const t2 = t * t;
	const t3 = t2 * t;
	const t4 = t3 * t;
	const t5 = t4 * t;

	const pdf = Math.exp(-0.5 * absX * absX) / Math.sqrt(2 * Math.PI);
	const cdfPositive = 1.0 - pdf * (b1 * t + b2 * t2 + b3 * t3 + b4 * t4 + b5 * t5);

	return x >= 0 ? cdfPositive : 1.0 - cdfPositive;
}

function normalPDF(x: number): number {
	return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function calculateExpiredGreeks(S: number, K: number, isCall: boolean): PositionGreeks {
	const intrinsicValue = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
	const delta = isCall ? (S > K ? 1 : 0) : S < K ? -1 : 0;
	return { delta, gamma: 0, theta: 0, vega: 0, rho: 0, theoreticalPrice: intrinsicValue };
}

function calculateZeroVolatilityGreeks(
	S: number,
	K: number,
	r: number,
	T: number,
	isCall: boolean,
): PositionGreeks {
	const pv = Math.exp(-r * T);
	const intrinsicValue = isCall ? Math.max(S - K * pv, 0) : Math.max(K * pv - S, 0);
	const delta = isCall ? (S > K * pv ? 1 : 0) : S < K * pv ? -1 : 0;
	return { delta, gamma: 0, theta: 0, vega: 0, rho: 0, theoreticalPrice: intrinsicValue };
}

function calculateStandardGreeks(
	S: number,
	K: number,
	T: number,
	sigma: number,
	r: number,
	isCall: boolean,
): PositionGreeks {
	const sqrtT = Math.sqrt(T);
	const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
	const d2 = d1 - sigma * sqrtT;
	const expRT = Math.exp(-r * T);

	const Nd1 = normalCDF(d1);
	const Nd2 = normalCDF(d2);
	const nd1 = normalPDF(d1);

	const delta = isCall ? Nd1 : Nd1 - 1;
	const gamma = nd1 / (S * sigma * sqrtT);

	const thetaTerm1 = -(S * nd1 * sigma) / (2 * sqrtT);
	const theta =
		(isCall ? thetaTerm1 - r * K * expRT * Nd2 : thetaTerm1 + r * K * expRT * (1 - Nd2)) /
		DAYS_PER_YEAR;

	const vega = (S * sqrtT * nd1) / 100;
	const rho = isCall ? (K * T * expRT * Nd2) / 100 : (-K * T * expRT * (1 - Nd2)) / 100;

	const theoreticalPrice = isCall
		? S * Nd1 - K * expRT * Nd2
		: K * expRT * (1 - Nd2) - S * (1 - Nd1);

	return {
		delta,
		gamma,
		theta,
		vega,
		rho,
		theoreticalPrice: Math.max(theoreticalPrice, 0),
	};
}

function calculateGreeks(
	S: number,
	K: number,
	T: number,
	sigma: number,
	isCall: boolean,
	r = DEFAULT_RISK_FREE_RATE,
): PositionGreeks {
	if (T <= 0) {
		return calculateExpiredGreeks(S, K, isCall);
	}
	if (sigma <= 0) {
		return calculateZeroVolatilityGreeks(S, K, r, T, isCall);
	}
	return calculateStandardGreeks(S, K, T, sigma, r, isCall);
}

function daysUntilExpiration(expiration: string): number {
	const expDate = new Date(expiration);
	const now = new Date();
	return Math.max(0, (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function buildStreamingPosition(
	position: OptionsPosition,
	contractPrices: Record<string, number>,
	throttledUnderlyingPrices: Record<string, number>,
	defaultIV: number,
	isStreaming: boolean,
	previousPricesRef: RefObject<Record<string, number>>,
): StreamingOptionsPosition {
	const livePrice = contractPrices[position.contractSymbol] ?? position.currentPrice;
	const previousPrice = previousPricesRef.current[position.contractSymbol] ?? position.currentPrice;
	const underlyingPrice = throttledUnderlyingPrices[position.underlying] ?? 0;

	const T = daysUntilExpiration(position.expiration) / DAYS_PER_YEAR;
	const greeks = calculateGreeks(
		underlyingPrice,
		position.strike,
		T,
		defaultIV,
		position.right === "CALL",
	);

	const costBasis = position.avgCost * Math.abs(position.quantity) * MULTIPLIER;
	const marketValue = livePrice * Math.abs(position.quantity) * MULTIPLIER;
	const sign = position.quantity > 0 ? 1 : -1;
	const liveUnrealizedPnl = sign * (marketValue - costBasis);
	const liveUnrealizedPnlPct = costBasis > 0 ? (liveUnrealizedPnl / costBasis) * 100 : 0;

	return {
		...position,
		livePrice,
		previousPrice,
		liveUnrealizedPnl,
		liveUnrealizedPnlPct,
		greeks,
		isStreaming,
		lastUpdated: isStreaming ? new Date() : null,
	};
}

function createStreamingPositions(
	positions: OptionsPosition[],
	contractPrices: Record<string, number>,
	throttledUnderlyingPrices: Record<string, number>,
	defaultIV: number,
	isStreaming: boolean,
	previousPricesRef: RefObject<Record<string, number>>,
): StreamingOptionsPosition[] {
	return positions.map((position) =>
		buildStreamingPosition(
			position,
			contractPrices,
			throttledUnderlyingPrices,
			defaultIV,
			isStreaming,
			previousPricesRef,
		),
	);
}

function aggregateGreeks(
	positions: StreamingOptionsPosition[],
	throttledUnderlyingPrices: Record<string, number>,
): AggregateGreeks {
	return positions.reduce<AggregateGreeks>(
		(acc, pos) => {
			const underlyingPrice = throttledUnderlyingPrices[pos.underlying] ?? 0;
			const positionMultiplier = pos.quantity * MULTIPLIER;

			acc.deltaNotional += positionMultiplier * pos.greeks.delta * underlyingPrice;
			acc.totalGamma += positionMultiplier * pos.greeks.gamma;
			acc.totalTheta += positionMultiplier * pos.greeks.theta;
			acc.totalVega += positionMultiplier * pos.greeks.vega;
			acc.totalRho += positionMultiplier * pos.greeks.rho;

			return acc;
		},
		{ deltaNotional: 0, totalGamma: 0, totalTheta: 0, totalVega: 0, totalRho: 0 },
	);
}

function buildContractPriceSeed(
	positions: OptionsPosition[],
	previousPricesRef: RefObject<Record<string, number>>,
): Record<string, number> {
	const seed = positions.reduce<Record<string, number>>((acc, position) => {
		acc[position.contractSymbol] = position.currentPrice;
		previousPricesRef.current[position.contractSymbol] = position.currentPrice;
		return acc;
	}, {});
	return seed;
}

function useContractPriceState(
	positions: OptionsPosition[],
	previousPricesRef: RefObject<Record<string, number>>,
) {
	const [contractPrices, setContractPrices] = useState<Record<string, number>>({});
	const [isStreaming, setIsStreaming] = useState(false);

	useEffect(() => {
		setContractPrices(buildContractPriceSeed(positions, previousPricesRef));
	}, [positions, previousPricesRef]);

	const updateContractPrice = useCallback(
		(symbol: string, price: number) => {
			setContractPrices((prev) => {
				previousPricesRef.current[symbol] = prev[symbol] ?? price;
				return { ...prev, [symbol]: price };
			});
			setIsStreaming(true);
		},
		[previousPricesRef],
	);

	return { contractPrices, isStreaming, updateContractPrice, setIsStreaming };
}

function useThrottledUnderlyingState(underlyingPrices: Record<string, number>) {
	const [throttledUnderlyingPrices, setThrottledUnderlyingPrices] = useState<
		Record<string, number>
	>(() => ({ ...underlyingPrices }));
	const prevUnderlyingPricesRef = useRef<string>("");

	useEffect(() => {
		const serialized = JSON.stringify(underlyingPrices);
		if (serialized === prevUnderlyingPricesRef.current) {
			return;
		}
		prevUnderlyingPricesRef.current = serialized;
		setThrottledUnderlyingPrices((prev) => ({ ...prev, ...underlyingPrices }));
	}, [underlyingPrices]);

	return {
		throttledUnderlyingPrices,
		setThrottledUnderlyingPrices,
	};
}

function scheduleGreeksRecalculation(
	recalcTimerRef: RefObject<ReturnType<typeof setTimeout> | null>,
	pendingUnderlyingUpdatesRef: RefObject<Record<string, number>>,
	setThrottledUnderlyingPrices: Dispatch<SetStateAction<Record<string, number>>>,
) {
	if (recalcTimerRef.current !== null) {
		return;
	}

	recalcTimerRef.current = setTimeout(() => {
		if (!isOptionsMarketOpen()) {
			recalcTimerRef.current = null;
			return;
		}

		if (Object.keys(pendingUnderlyingUpdatesRef.current).length > 0) {
			setThrottledUnderlyingPrices((prev) => ({
				...prev,
				...pendingUnderlyingUpdatesRef.current,
			}));
			pendingUnderlyingUpdatesRef.current = {};
		}

		recalcTimerRef.current = null;
	}, GREEKS_RECALC_INTERVAL_MS);
}

function useUnderlyingsUpdater(
	pendingUnderlyingUpdatesRef: RefObject<Record<string, number>>,
	setThrottledUnderlyingPrices: Dispatch<SetStateAction<Record<string, number>>>,
	setIsStreaming: Dispatch<SetStateAction<boolean>>,
) {
	const recalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const scheduleGreeksRecalc = useCallback(() => {
		scheduleGreeksRecalculation(
			recalcTimerRef,
			pendingUnderlyingUpdatesRef,
			setThrottledUnderlyingPrices,
		);
	}, [pendingUnderlyingUpdatesRef, setThrottledUnderlyingPrices]);

	const updateUnderlyingPrice = useCallback(
		(symbol: string, price: number) => {
			setIsStreaming(true);
			if (!isOptionsMarketOpen()) {
				return;
			}
			pendingUnderlyingUpdatesRef.current[symbol] = price;
			scheduleGreeksRecalc();
		},
		[setIsStreaming, pendingUnderlyingUpdatesRef, scheduleGreeksRecalc],
	);

	useEffect(() => {
		return () => {
			if (recalcTimerRef.current !== null) {
				clearTimeout(recalcTimerRef.current);
			}
		};
	}, []);

	return updateUnderlyingPrice;
}

function useStreamingGreeks(
	positions: OptionsPosition[],
	contractPrices: Record<string, number>,
	throttledUnderlyingPrices: Record<string, number>,
	defaultIV: number,
	isStreaming: boolean,
	previousPricesRef: RefObject<Record<string, number>>,
) {
	const streamingPositions = useMemo<StreamingOptionsPosition[]>(() => {
		return createStreamingPositions(
			positions,
			contractPrices,
			throttledUnderlyingPrices,
			defaultIV,
			isStreaming,
			previousPricesRef,
		);
	}, [
		positions,
		contractPrices,
		throttledUnderlyingPrices,
		defaultIV,
		isStreaming,
		previousPricesRef,
	]);

	const portfolioGreeks = useMemo<AggregateGreeks>(
		() => aggregateGreeks(streamingPositions, throttledUnderlyingPrices),
		[streamingPositions, throttledUnderlyingPrices],
	);

	return { streamingPositions, portfolioGreeks };
}

export function usePositionGreeks(options: UsePositionGreeksOptions): UsePositionGreeksReturn {
	const { positions, underlyingPrices, defaultIV = DEFAULT_IV } = options;
	const previousPricesRef = useRef<Record<string, number>>({});
	const pendingUnderlyingUpdatesRef = useRef<Record<string, number>>({});

	const { contractPrices, isStreaming, updateContractPrice, setIsStreaming } =
		useContractPriceState(positions, previousPricesRef);
	const { throttledUnderlyingPrices, setThrottledUnderlyingPrices } =
		useThrottledUnderlyingState(underlyingPrices);
	const updateUnderlyingPrice = useUnderlyingsUpdater(
		pendingUnderlyingUpdatesRef,
		setThrottledUnderlyingPrices,
		setIsStreaming,
	);
	const { streamingPositions, portfolioGreeks } = useStreamingGreeks(
		positions,
		contractPrices,
		throttledUnderlyingPrices,
		defaultIV,
		isStreaming,
		previousPricesRef,
	);

	return {
		streamingPositions,
		aggregateGreeks: portfolioGreeks,
		isStreaming,
		updateContractPrice,
		updateUnderlyingPrice,
	};
}

export default usePositionGreeks;
