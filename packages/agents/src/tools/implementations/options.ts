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
	if (isTest(ctx)) {
		throw new Error("getOptionChain is not available in test mode");
	}

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

	// Group options by expiration
	const expirationMap = new Map<string, OptionExpiration>();

	for (const opt of chain.options) {
		const contract = opt.contract;
		const quote = opt.quote;
		if (!contract || !quote) {
			continue;
		}

		const expiration = contract.expiration ?? ""; // Already in YYYY-MM-DD format
		const optionType = contract.optionType === 1 ? "call" : "put"; // 1 = CALL, 2 = PUT

		// Construct a symbol from underlying, expiration, type, strike
		const typeChar = optionType === "call" ? "C" : "P";
		const expirationShort = expiration.replace(/-/g, "").slice(2); // YYMMDD
		const strikeStr = Math.floor(contract.strike * 1000)
			.toString()
			.padStart(8, "0");
		const constructedSymbol = `${contract.underlying.padEnd(6)}${expirationShort}${typeChar}${strikeStr}`;

		const optContract: OptionContract = {
			symbol: constructedSymbol,
			strike: contract.strike,
			expiration,
			type: optionType,
			bid: quote.bid,
			ask: quote.ask,
			last: quote.last,
			volume: Number(quote.volume),
			openInterest: opt.openInterest ?? 0,
		};

		let expData = expirationMap.get(expiration);
		if (!expData) {
			expData = { expiration, calls: [], puts: [] };
			expirationMap.set(expiration, expData);
		}

		if (optionType === "call") {
			expData.calls.push(optContract);
		} else {
			expData.puts.push(optContract);
		}
	}

	// Sort expirations and convert to array
	const sortedExpirations = Array.from(expirationMap.values()).sort((a, b) =>
		a.expiration.localeCompare(b.expiration),
	);

	// Sort calls/puts by strike
	for (const exp of sortedExpirations) {
		exp.calls.sort((a, b) => a.strike - b.strike);
		exp.puts.sort((a, b) => a.strike - b.strike);
	}

	return {
		underlying,
		expirations: sortedExpirations,
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
	if (isTest(ctx)) {
		throw new Error("getGreeks is not available in test mode");
	}

	// Parse the OSI symbol to extract components
	const parsed = parseOSISymbol(contractSymbol);
	if (!parsed) {
		throw new Error(`Invalid OSI symbol format: ${contractSymbol}`);
	}

	const client = getMarketDataClient();

	// Get option chain for the underlying
	const response = await client.getOptionChain({
		underlying: parsed.underlying,
	});

	const chain = response.data.chain;
	if (!chain || !chain.options) {
		throw new Error(`No option chain found for underlying: ${parsed.underlying}`);
	}

	// Find the specific contract by matching underlying, expiration, type, and strike
	const option = chain.options.find((opt: OptionQuote) => {
		const contract = opt.contract;
		if (!contract) {
			return false;
		}

		const matchesUnderlying =
			contract.underlying.toUpperCase().trim() === parsed.underlying.toUpperCase();
		const matchesExpiration = contract.expiration === parsed.expiration;
		const matchesType =
			(parsed.type === "call" && contract.optionType === 1) ||
			(parsed.type === "put" && contract.optionType === 2);
		// Allow small tolerance for strike matching (floating point)
		const matchesStrike = Math.abs(contract.strike - parsed.strike) < 0.01;

		return matchesUnderlying && matchesExpiration && matchesType && matchesStrike;
	});

	if (!option) {
		throw new Error(`Contract not found: ${contractSymbol}`);
	}

	// If provider Greeks are available, use them
	if (option.delta !== undefined && option.gamma !== undefined) {
		return {
			delta: option.delta,
			gamma: option.gamma,
			theta: option.theta ?? 0,
			vega: option.vega ?? 0,
			rho: option.rho ?? 0,
			iv: option.impliedVolatility ?? 0,
		};
	}

	// Fallback: Calculate Greeks locally using Black-Scholes
	// Only if we can determine IV accurately (from provider or bid/ask)
	const underlyingPrice = chain.underlyingPrice;
	if (!underlyingPrice || underlyingPrice <= 0) {
		throw new Error(`Greeks not available: no underlying price for ${parsed.underlying}`);
	}

	// Calculate time to expiration in years
	const expirationDate = new Date(`${parsed.expiration}T16:00:00-05:00`); // 4 PM ET expiration
	const now = new Date();
	const daysToExpiry = Math.max(
		0,
		(expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
	);
	const timeToExpiration = daysToYears(daysToExpiry);

	if (timeToExpiration <= 0) {
		throw new Error(`Greeks not available: contract ${contractSymbol} has expired`);
	}

	// Get risk-free rate from FRED
	const riskFreeRate = await getRiskFreeRate();
	if (riskFreeRate === null) {
		throw new Error(
			`Greeks not available for ${contractSymbol}: cannot fetch risk-free rate from FRED`,
		);
	}

	// Determine IV - require either provider IV or solvable from quotes
	let impliedVolatility: number | null = option.impliedVolatility ?? null;

	const quote = option.quote;
	if (impliedVolatility === null && quote && quote.bid > 0 && quote.ask > 0) {
		impliedVolatility = solveIVFromQuote(
			quote.bid,
			quote.ask,
			underlyingPrice,
			parsed.strike,
			timeToExpiration,
			parsed.type === "call" ? "CALL" : "PUT",
			riskFreeRate,
		);
	}

	if (impliedVolatility === null) {
		throw new Error(
			`Greeks not available for ${contractSymbol}: no IV from provider and cannot solve from quotes (likely illiquid contract)`,
		);
	}

	// Calculate Greeks using Black-Scholes
	const bsGreeks = calculateBlackScholesGreeks({
		symbol: parsed.underlying,
		contracts: 1,
		strike: parsed.strike,
		underlyingPrice,
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
