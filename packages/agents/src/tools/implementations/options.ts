/**
 * Options Tools
 *
 * Get option chain and Greeks using gRPC MarketDataService.
 * Falls back to local Black-Scholes calculation when provider Greeks unavailable.
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import {
	calculateGreeks as calculateBlackScholesGreeks,
	daysToYears,
	solveIVFromQuote,
} from "@cream/marketdata";
import type { OptionQuote } from "@cream/schema-gen/cream/v1/market_snapshot";
import { getFREDClient, getMarketDataClient } from "../clients.js";
import type { Greeks, OptionChainResponse, OptionContract, OptionExpiration } from "../types.js";

// ============================================
// Risk-Free Rate from FRED
// ============================================

interface CachedRate {
	rate: number;
	fetchedAt: number;
}

let cachedRiskFreeRate: CachedRate | null = null;
const RATE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get current risk-free rate from FRED (Federal Funds Rate).
 * Caches the rate for 1 hour to avoid excessive API calls.
 *
 * @returns Risk-free rate as decimal (e.g., 0.045 for 4.5%), or null if unavailable
 */
async function getRiskFreeRate(): Promise<number | null> {
	const now = Date.now();

	if (cachedRiskFreeRate && now - cachedRiskFreeRate.fetchedAt < RATE_CACHE_TTL_MS) {
		return cachedRiskFreeRate.rate;
	}

	const client = getFREDClient();
	if (!client) {
		return null;
	}

	try {
		const latest = await client.getLatestValue("FEDFUNDS");
		if (latest) {
			const rate = latest.value / 100; // Convert from percent to decimal
			cachedRiskFreeRate = { rate, fetchedAt: now };
			return rate;
		}
	} catch {
		// FRED API error - return cached value if available, otherwise null
		if (cachedRiskFreeRate) {
			return cachedRiskFreeRate.rate;
		}
	}

	return null;
}

/**
 * Parse OSI symbol into components
 * OSI format: ROOT (up to 6 chars padded) + YYMMDD + C/P + strike * 1000 (8 digits)
 * e.g., "AAPL  240119C00185000" -> { underlying: "AAPL", expiration: "2024-01-19", type: "call", strike: 185 }
 */
export function parseOSISymbol(
	osiSymbol: string,
): { underlying: string; expiration: string; type: "call" | "put"; strike: number } | null {
	// Remove all spaces and convert to uppercase
	const normalized = osiSymbol.replace(/\s/g, "").toUpperCase();

	// OSI format: ROOT + YYMMDD + C/P + 8 digit strike
	// Minimum length: 1 (root) + 6 (date) + 1 (type) + 8 (strike) = 16
	if (normalized.length < 16) {
		return null;
	}

	// Extract components from the end (strike is always 8 digits, type is 1 char, date is 6 digits)
	const strike = Number.parseInt(normalized.slice(-8), 10) / 1000;
	const typeChar = normalized.slice(-9, -8);
	const dateStr = normalized.slice(-15, -9);
	const underlying = normalized.slice(0, -15);

	if (typeChar !== "C" && typeChar !== "P") {
		return null;
	}
	if (!/^\d{6}$/.test(dateStr)) {
		return null;
	}

	// Parse date: YYMMDD -> YYYY-MM-DD
	const yy = Number.parseInt(dateStr.slice(0, 2), 10);
	const mm = dateStr.slice(2, 4);
	const dd = dateStr.slice(4, 6);
	const year = yy >= 70 ? 1900 + yy : 2000 + yy; // Handle Y2K-ish dates

	return {
		underlying: underlying.trim(),
		expiration: `${year}-${mm}-${dd}`,
		type: typeChar === "C" ? "call" : "put",
		strike,
	};
}

type ParsedOSISymbol = NonNullable<ReturnType<typeof parseOSISymbol>>;
type OptionType = "call" | "put";

interface NormalizedOptionChain {
	options: OptionQuote[];
	underlyingPrice: number | null;
}

function assertNotTestMode(ctx: ExecutionContext, operation: string): void {
	if (isTest(ctx)) {
		throw new Error(`${operation} is not available in test mode`);
	}
}

function getOptionType(optionTypeValue: number): OptionType {
	return optionTypeValue === 1 ? "call" : "put";
}

function getTypeChar(optionType: OptionType): "C" | "P" {
	return optionType === "call" ? "C" : "P";
}

function buildContractSymbol(
	underlying: string,
	expiration: string,
	optionType: OptionType,
	strike: number,
): string {
	const expirationShort = expiration.replaceAll("-", "").slice(2); // YYMMDD
	const strikeStr = Math.floor(strike * 1000)
		.toString()
		.padStart(8, "0");
	return `${underlying.padEnd(6)}${expirationShort}${getTypeChar(optionType)}${strikeStr}`;
}

function toMappedContract(option: OptionQuote): {
	expiration: string;
	type: OptionType;
	contract: OptionContract;
} | null {
	const contract = option.contract;
	const quote = option.quote;
	if (!contract || !quote) {
		return null;
	}

	const expiration = contract.expiration ?? "";
	const type = getOptionType(contract.optionType);
	return {
		expiration,
		type,
		contract: {
			symbol: buildContractSymbol(contract.underlying, expiration, type, contract.strike),
			strike: contract.strike,
			expiration,
			type,
			bid: quote.bid,
			ask: quote.ask,
			last: quote.last,
			volume: Number(quote.volume),
			openInterest: option.openInterest ?? 0,
		},
	};
}

function addToExpirationMap(
	expirationMap: Map<string, OptionExpiration>,
	mapped: { expiration: string; type: OptionType; contract: OptionContract },
): void {
	let expirationData = expirationMap.get(mapped.expiration);
	if (!expirationData) {
		expirationData = { expiration: mapped.expiration, calls: [], puts: [] };
		expirationMap.set(mapped.expiration, expirationData);
	}

	if (mapped.type === "call") {
		expirationData.calls.push(mapped.contract);
		return;
	}
	expirationData.puts.push(mapped.contract);
}

function sortExpirations(expirationMap: Map<string, OptionExpiration>): OptionExpiration[] {
	const sortedExpirations = [...expirationMap.values()].sort((a, b) =>
		a.expiration.localeCompare(b.expiration),
	);
	for (const expiration of sortedExpirations) {
		expiration.calls.sort((a, b) => a.strike - b.strike);
		expiration.puts.sort((a, b) => a.strike - b.strike);
	}
	return sortedExpirations;
}

function parseContractSymbolOrThrow(contractSymbol: string): ParsedOSISymbol {
	const parsed = parseOSISymbol(contractSymbol);
	if (!parsed) {
		throw new Error(`Invalid OSI symbol format: ${contractSymbol}`);
	}
	return parsed;
}

function toNormalizedOptionChain(
	chain: { options?: OptionQuote[]; underlyingPrice?: number } | undefined,
	underlying: string,
): NormalizedOptionChain {
	const options = chain?.options;
	if (!options) {
		throw new Error(`No option chain found for underlying: ${underlying}`);
	}
	return { options, underlyingPrice: chain?.underlyingPrice ?? null };
}

function matchesContract(option: OptionQuote, parsed: ParsedOSISymbol): boolean {
	const contract = option.contract;
	if (!contract) {
		return false;
	}

	const matchesUnderlying =
		contract.underlying.toUpperCase().trim() === parsed.underlying.toUpperCase();
	const matchesExpiration = contract.expiration === parsed.expiration;
	const matchesType =
		(parsed.type === "call" && contract.optionType === 1) ||
		(parsed.type === "put" && contract.optionType === 2);
	const matchesStrike = Math.abs(contract.strike - parsed.strike) < 0.01;
	return matchesUnderlying && matchesExpiration && matchesType && matchesStrike;
}

function findOptionOrThrow(
	options: OptionQuote[],
	parsed: ParsedOSISymbol,
	contractSymbol: string,
): OptionQuote {
	const matched = options.find((option) => matchesContract(option, parsed));
	if (!matched) {
		throw new Error(`Contract not found: ${contractSymbol}`);
	}
	return matched;
}

function hasProviderGreeks(option: OptionQuote): boolean {
	return option.delta !== undefined && option.gamma !== undefined;
}

function toProviderGreeks(option: OptionQuote): Greeks {
	return {
		delta: option.delta ?? 0,
		gamma: option.gamma ?? 0,
		theta: option.theta ?? 0,
		vega: option.vega ?? 0,
		rho: option.rho ?? 0,
		iv: option.impliedVolatility ?? 0,
	};
}

function getTimeToExpirationYears(expiration: string): number {
	const expirationDate = new Date(`${expiration}T16:00:00-05:00`);
	const now = new Date();
	const daysToExpiry = Math.max(
		0,
		(expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
	);
	return daysToYears(daysToExpiry);
}

function validateFallbackInputs(
	contractSymbol: string,
	parsed: ParsedOSISymbol,
	underlyingPrice: number | null,
): { underlyingPrice: number; timeToExpiration: number } {
	if (!underlyingPrice || underlyingPrice <= 0) {
		throw new Error(`Greeks not available: no underlying price for ${parsed.underlying}`);
	}

	const timeToExpiration = getTimeToExpirationYears(parsed.expiration);
	if (timeToExpiration <= 0) {
		throw new Error(`Greeks not available: contract ${contractSymbol} has expired`);
	}

	return { underlyingPrice, timeToExpiration };
}

function solveImpliedVolatility(
	option: OptionQuote,
	parsed: ParsedOSISymbol,
	underlyingPrice: number,
	timeToExpiration: number,
	riskFreeRate: number,
): number | null {
	const quote = option.quote;
	if (!quote || quote.bid <= 0 || quote.ask <= 0) {
		return option.impliedVolatility ?? null;
	}

	return (
		option.impliedVolatility ??
		solveIVFromQuote(
			quote.bid,
			quote.ask,
			underlyingPrice,
			parsed.strike,
			timeToExpiration,
			parsed.type === "call" ? "CALL" : "PUT",
			riskFreeRate,
		)
	);
}

async function calculateFallbackGreeks(
	option: OptionQuote,
	parsed: ParsedOSISymbol,
	contractSymbol: string,
	underlyingPrice: number | null,
): Promise<Greeks> {
	const { underlyingPrice: resolvedUnderlyingPrice, timeToExpiration } = validateFallbackInputs(
		contractSymbol,
		parsed,
		underlyingPrice,
	);
	const riskFreeRate = await getRiskFreeRate();
	if (riskFreeRate === null) {
		throw new Error(
			`Greeks not available for ${contractSymbol}: cannot fetch risk-free rate from FRED`,
		);
	}

	const impliedVolatility = solveImpliedVolatility(
		option,
		parsed,
		resolvedUnderlyingPrice,
		timeToExpiration,
		riskFreeRate,
	);
	if (impliedVolatility === null) {
		throw new Error(
			`Greeks not available for ${contractSymbol}: no IV from provider and cannot solve from quotes (likely illiquid contract)`,
		);
	}

	const bsGreeks = calculateBlackScholesGreeks({
		symbol: parsed.underlying,
		contracts: 1,
		strike: parsed.strike,
		underlyingPrice: resolvedUnderlyingPrice,
		timeToExpiration,
		impliedVolatility,
		optionType: parsed.type === "call" ? "CALL" : "PUT",
		riskFreeRate,
	});

	return {
		delta: bsGreeks.delta,
		gamma: bsGreeks.gamma,
		theta: bsGreeks.theta,
		vega: bsGreeks.vega,
		rho: bsGreeks.rho,
		iv: impliedVolatility,
	};
}

/**
 * Get option chain for an underlying
 *
 * Uses gRPC MarketDataService.
 *
 * @param ctx - ExecutionContext
 * @param underlying - Underlying symbol
 * @returns Option chain with expirations and strikes
 * @throws Error if gRPC call fails or test mode is used
 */
export async function getOptionChain(
	ctx: ExecutionContext,
	underlying: string,
): Promise<OptionChainResponse> {
	assertNotTestMode(ctx, "getOptionChain");

	const client = getMarketDataClient();
	const response = await client.getOptionChain({
		underlying,
	});

	const chain = response.data.chain;
	if (!chain || !chain.options || chain.options.length === 0) {
		return {
			underlying,
			expirations: [],
		};
	}

	const expirationMap = new Map<string, OptionExpiration>();
	for (const opt of chain.options) {
		const mapped = toMappedContract(opt);
		if (!mapped) {
			continue;
		}
		addToExpirationMap(expirationMap, mapped);
	}

	return {
		underlying,
		expirations: sortExpirations(expirationMap),
	};
}

/**
 * Get Greeks for an option contract
 *
 * Uses gRPC MarketDataService GetOptionChain to find the specific contract
 * and extract its Greeks. Falls back to local Black-Scholes calculation
 * when provider Greeks are unavailable (common for illiquid contracts).
 *
 * @param ctx - ExecutionContext
 * @param contractSymbol - Option contract symbol (OSI format)
 * @returns Greeks (delta, gamma, theta, vega, rho, IV)
 * @throws Error if contract not found, invalid symbol, or gRPC fails
 */
export async function getGreeks(ctx: ExecutionContext, contractSymbol: string): Promise<Greeks> {
	assertNotTestMode(ctx, "getGreeks");
	const parsed = parseContractSymbolOrThrow(contractSymbol);
	const client = getMarketDataClient();
	const response = await client.getOptionChain({
		underlying: parsed.underlying,
	});
	const chain = toNormalizedOptionChain(response.data.chain, parsed.underlying);
	const option = findOptionOrThrow(chain.options, parsed, contractSymbol);
	if (hasProviderGreeks(option)) {
		return toProviderGreeks(option);
	}
	return calculateFallbackGreeks(option, parsed, contractSymbol, chain.underlyingPrice);
}
