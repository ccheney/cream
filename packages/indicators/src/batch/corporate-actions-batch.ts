/**
 * Corporate Actions Batch Job
 *
 * Fetches corporate actions (dividends, splits, mergers) from Alpaca API
 * and stores calculated indicators in Turso.
 *
 * Runs daily (6 AM ET) to fetch upcoming corporate actions and calculate:
 * - Trailing dividend yield
 * - Days until ex-dividend
 * - Dividend growth rate
 * - Split-adjusted awareness flags
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { CorporateActionInsert, CorporateActionsRepository } from "@cream/storage";
import { log } from "../logger.js";
import type { BatchJobResult } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Alpaca Corporate Action API response format.
 *
 * Based on Alpaca API documentation:
 * - Endpoint: GET /v1/corporate_actions
 * - Returns dividends, splits, and other corporate actions
 */
export interface AlpacaCorporateAction {
	corporate_action_type: AlpacaActionType;
	symbol: string;
	ex_date: string; // YYYY-MM-DD
	record_date: string | null;
	payment_date: string | null;
	/** For dividends: cash amount per share; for splits: ratio (e.g., 2 for 2:1) */
	value: number;
	/** Additional details (varies by action type) */
	description?: string;
}

/**
 * Supported corporate action types from Alpaca
 */
export type AlpacaActionType =
	| "Dividend"
	| "SpecialDividend"
	| "Split"
	| "ReverseSplit"
	| "Spinoff"
	| "Merger"
	| "Acquisition"
	| "NameChange";

/**
 * Alpaca Corporate Actions API client interface for dependency injection.
 */
export interface AlpacaCorporateActionsClient {
	/**
	 * Get corporate actions for a date range.
	 * @param params Query parameters
	 * @returns Array of corporate actions
	 */
	getCorporateActions(params: {
		symbol?: string;
		startDate?: string;
		endDate?: string;
		limit?: number;
	}): Promise<AlpacaCorporateAction[]>;

	/**
	 * Get corporate actions for multiple symbols.
	 * @param symbols Array of stock symbols
	 * @param startDate Start date (YYYY-MM-DD)
	 * @param endDate End date (YYYY-MM-DD)
	 * @returns Array of corporate actions
	 */
	getCorporateActionsForSymbols(
		symbols: string[],
		startDate: string,
		endDate: string
	): Promise<AlpacaCorporateAction[]>;
}

/**
 * Price provider for calculating dividend yield.
 */
export interface PriceProvider {
	/**
	 * Get current price for a symbol.
	 * @param symbol Stock symbol
	 * @returns Current price or null if not available
	 */
	getCurrentPrice(symbol: string): Promise<number | null>;
}

/**
 * Batch job configuration
 */
export interface CorporateActionsBatchJobConfig {
	/** Rate limit delay between API calls in ms (default: 100ms) */
	rateLimitDelayMs?: number;
	/** Max retries per API call (default: 3) */
	maxRetries?: number;
	/** Retry delay in ms (default: 1000) */
	retryDelayMs?: number;
	/** Continue on individual symbol errors (default: true) */
	continueOnError?: boolean;
	/** Lookback days for historical actions (default: 365) */
	lookbackDays?: number;
	/** Lookahead days for upcoming actions (default: 90) */
	lookaheadDays?: number;
}

/**
 * Calculated dividend indicators for a symbol
 */
export interface DividendIndicators {
	/** Trailing 12-month dividend yield (sum of dividends / current price) */
	trailingDividendYield: number | null;
	/** Days until next ex-dividend date (null if none scheduled) */
	daysToExDividend: number | null;
	/** Year-over-year dividend growth rate */
	dividendGrowth: number | null;
	/** Most recent dividend amount per share */
	lastDividendAmount: number | null;
	/** Annual dividend (last 4 quarters summed) */
	annualDividend: number | null;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get date string in YYYY-MM-DD format
 */
function formatDate(date: Date): string {
	const datePart = date.toISOString().split("T")[0];
	if (!datePart) {
		throw new Error("Failed to format date");
	}
	return datePart;
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
	const msPerDay = 24 * 60 * 60 * 1000;
	return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
}

/**
 * Map Alpaca action type to our internal ActionType
 */
export function mapAlpacaActionType(
	alpacaType: AlpacaActionType
): CorporateActionInsert["actionType"] {
	const mapping: Record<AlpacaActionType, CorporateActionInsert["actionType"]> = {
		Dividend: "dividend",
		SpecialDividend: "special_dividend",
		Split: "split",
		ReverseSplit: "reverse_split",
		Spinoff: "spinoff",
		Merger: "merger",
		Acquisition: "acquisition",
		NameChange: "name_change",
	};
	return mapping[alpacaType];
}

// ============================================
// Calculation Functions
// ============================================

/**
 * Calculate trailing 12-month dividend yield.
 *
 * Formula: Sum of dividends in last 12 months / Current Price
 *
 * @param dividends Array of dividend amounts from last 12 months
 * @param currentPrice Current stock price
 * @returns Dividend yield as decimal (0.025 = 2.5%), or null if not calculable
 */
export function calculateTrailingDividendYield(
	dividends: number[],
	currentPrice: number | null
): number | null {
	if (currentPrice === null || currentPrice <= 0 || dividends.length === 0) {
		return null;
	}
	const totalDividends = dividends.reduce((sum, d) => sum + d, 0);
	const yield_ = totalDividends / currentPrice;
	return Number.isFinite(yield_) ? yield_ : null;
}

/**
 * Calculate days until next ex-dividend date.
 *
 * @param nextExDate Next ex-dividend date
 * @param referenceDate Reference date (defaults to today)
 * @returns Days until ex-dividend, or null if no upcoming ex-date
 */
export function calculateDaysToExDividend(
	nextExDate: string | null,
	referenceDate: Date = new Date()
): number | null {
	if (!nextExDate) {
		return null;
	}
	const exDate = new Date(nextExDate);
	const days = daysBetween(referenceDate, exDate);
	// Only return positive values (future dates)
	return days >= 0 ? days : null;
}

/**
 * Calculate year-over-year dividend growth.
 *
 * @param currentYearDividends Sum of dividends in current 12 months
 * @param priorYearDividends Sum of dividends in prior 12 months
 * @returns Growth rate as decimal, or null if not calculable
 */
export function calculateDividendGrowth(
	currentYearDividends: number,
	priorYearDividends: number
): number | null {
	if (priorYearDividends <= 0) {
		return null;
	}
	const growth = (currentYearDividends - priorYearDividends) / priorYearDividends;
	return Number.isFinite(growth) ? growth : null;
}

/**
 * Calculate split adjustment factor for price history.
 *
 * For a 2:1 split, returns 2 (multiply old prices by 2)
 * For a 1:2 reverse split, returns 0.5 (multiply old prices by 0.5)
 *
 * @param splitRatio Split ratio from Alpaca (e.g., 2 for 2:1 split)
 * @param isReverse Whether this is a reverse split
 * @returns Adjustment factor
 */
export function calculateSplitAdjustmentFactor(splitRatio: number, isReverse: boolean): number {
	if (isReverse) {
		// Reverse split: fewer shares, higher price
		// A 1:2 reverse means you get 1 share for every 2 (ratio = 0.5)
		return 1 / splitRatio;
	}
	// Forward split: more shares, lower price
	// A 2:1 split means you get 2 shares for every 1 (ratio = 2)
	return splitRatio;
}

/**
 * Check if a symbol has a pending split affecting price calculations.
 *
 * @param actions Corporate actions for the symbol
 * @param referenceDate Reference date
 * @param daysAhead Days ahead to look for pending splits
 * @returns True if there's a pending split
 */
export function hasPendingSplit(
	actions: AlpacaCorporateAction[],
	referenceDate: Date = new Date(),
	daysAhead = 30
): boolean {
	const futureDate = new Date(referenceDate);
	futureDate.setDate(futureDate.getDate() + daysAhead);

	return actions.some((action) => {
		if (
			action.corporate_action_type !== "Split" &&
			action.corporate_action_type !== "ReverseSplit"
		) {
			return false;
		}
		const exDate = new Date(action.ex_date);
		return exDate >= referenceDate && exDate <= futureDate;
	});
}

/**
 * Calculate dividend indicators for a symbol.
 *
 * @param dividends Historical dividends sorted by date (most recent first)
 * @param currentPrice Current stock price
 * @param upcomingExDate Next ex-dividend date (if any)
 * @param priorYearDividends Sum of dividends from prior year period
 * @returns Calculated dividend indicators
 */
export function calculateDividendIndicators(
	dividends: Array<{ amount: number; exDate: string }>,
	currentPrice: number | null,
	upcomingExDate: string | null,
	priorYearDividends: number
): DividendIndicators {
	const now = new Date();
	const oneYearAgo = new Date(now);
	oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

	// Filter to last 12 months
	const trailingDividends = dividends.filter((d) => new Date(d.exDate) >= oneYearAgo);
	const dividendAmounts = trailingDividends.map((d) => d.amount);
	const annualDividend =
		dividendAmounts.length > 0 ? dividendAmounts.reduce((a, b) => a + b, 0) : null;

	return {
		trailingDividendYield: calculateTrailingDividendYield(dividendAmounts, currentPrice),
		daysToExDividend: calculateDaysToExDividend(upcomingExDate),
		dividendGrowth:
			annualDividend !== null ? calculateDividendGrowth(annualDividend, priorYearDividends) : null,
		lastDividendAmount: dividends[0]?.amount ?? null,
		annualDividend,
	};
}

// ============================================
// Batch Job Class
// ============================================

/**
 * Batch job for fetching and storing corporate action data from Alpaca.
 *
 * @example
 * ```typescript
 * const job = new CorporateActionsBatchJob(alpacaClient, priceProvider, repository);
 * const result = await job.run(symbols);
 * console.log(`Processed ${result.processed}, Failed ${result.failed}`);
 * ```
 */
export class CorporateActionsBatchJob {
	private readonly client: AlpacaCorporateActionsClient;
	private readonly repo: CorporateActionsRepository;
	private readonly config: Required<CorporateActionsBatchJobConfig>;

	constructor(
		client: AlpacaCorporateActionsClient,
		repo: CorporateActionsRepository,
		_priceProvider?: PriceProvider, // Reserved for future dividend yield calculation
		config?: CorporateActionsBatchJobConfig
	) {
		this.client = client;
		this.repo = repo;
		this.config = {
			rateLimitDelayMs: config?.rateLimitDelayMs ?? 100,
			maxRetries: config?.maxRetries ?? 3,
			retryDelayMs: config?.retryDelayMs ?? 1000,
			continueOnError: config?.continueOnError ?? true,
			lookbackDays: config?.lookbackDays ?? 365,
			lookaheadDays: config?.lookaheadDays ?? 90,
		};
	}

	/**
	 * Run batch job for a list of symbols.
	 *
	 * Fetches corporate actions from Alpaca API and stores in repository.
	 *
	 * @param symbols List of stock symbols to process
	 * @returns Batch job result with processed/failed counts
	 */
	async run(symbols: string[]): Promise<BatchJobResult> {
		const startTime = Date.now();
		let processed = 0;
		let failed = 0;
		const errors: Array<{ symbol: string; error: string }> = [];

		log.info({ symbolCount: symbols.length }, "Starting corporate actions batch job");

		// Calculate date range
		const endDate = new Date();
		endDate.setDate(endDate.getDate() + this.config.lookaheadDays);
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - this.config.lookbackDays);

		const startDateStr = formatDate(startDate);
		const endDateStr = formatDate(endDate);

		try {
			// Fetch all corporate actions for date range in one call
			const allActions = await this.fetchWithRetry(symbols, startDateStr, endDateStr);

			// Group actions by symbol
			const actionsBySymbol = new Map<string, AlpacaCorporateAction[]>();
			for (const action of allActions) {
				const symbol = action.symbol.toUpperCase();
				const existing = actionsBySymbol.get(symbol) ?? [];
				existing.push(action);
				actionsBySymbol.set(symbol, existing);
			}

			// Process each symbol
			for (const symbol of symbols) {
				const upperSymbol = symbol.toUpperCase();
				const symbolActions = actionsBySymbol.get(upperSymbol) ?? [];

				try {
					await this.processSymbol(upperSymbol, symbolActions);
					processed++;
					log.debug({ symbol: upperSymbol, actionCount: symbolActions.length }, "Processed symbol");
				} catch (error) {
					failed++;
					const errorMessage = error instanceof Error ? error.message : String(error);
					errors.push({ symbol: upperSymbol, error: errorMessage });
					log.warn({ symbol: upperSymbol, error: errorMessage }, "Failed to process symbol");

					if (!this.config.continueOnError) {
						throw error;
					}
				}
			}
		} catch (error) {
			// Top-level fetch failure
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error({ error: errorMessage }, "Failed to fetch corporate actions from Alpaca");

			if (!this.config.continueOnError) {
				throw error;
			}

			// Mark all symbols as failed
			for (const symbol of symbols) {
				if (processed === 0 && errors.length === 0) {
					failed++;
					errors.push({ symbol, error: `Fetch failed: ${errorMessage}` });
				}
			}
		}

		const durationMs = Date.now() - startTime;
		log.info({ processed, failed, durationMs }, "Completed corporate actions batch job");

		return { processed, failed, errors, durationMs };
	}

	/**
	 * Process a single symbol's corporate actions.
	 */
	private async processSymbol(symbol: string, actions: AlpacaCorporateAction[]): Promise<void> {
		// Store each action in the repository
		for (const action of actions) {
			const insert: CorporateActionInsert = {
				symbol,
				actionType: mapAlpacaActionType(action.corporate_action_type),
				exDate: action.ex_date,
				recordDate: action.record_date,
				payDate: action.payment_date,
				// For splits, value is the ratio; for dividends, it's the amount
				ratio:
					action.corporate_action_type === "Split" ||
					action.corporate_action_type === "ReverseSplit"
						? action.value
						: null,
				amount:
					action.corporate_action_type === "Dividend" ||
					action.corporate_action_type === "SpecialDividend"
						? action.value
						: null,
				details: action.description ? { description: action.description } : null,
				provider: "alpaca",
			};

			await this.repo.upsert(insert);
		}
	}

	/**
	 * Fetch corporate actions with retry logic.
	 */
	private async fetchWithRetry(
		symbols: string[],
		startDate: string,
		endDate: string
	): Promise<AlpacaCorporateAction[]> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
			try {
				return await this.client.getCorporateActionsForSymbols(symbols, startDate, endDate);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt < this.config.maxRetries) {
					const delay = this.config.retryDelayMs * (attempt + 1);
					log.warn({ attempt, delay, error: lastError.message }, "Retrying Alpaca API call");
					await sleep(delay);
				}
			}
		}

		throw lastError ?? new Error("Failed to fetch from Alpaca API");
	}
}
