/**
 * Options Chain API Routes
 *
 * Routes for fetching options chain data, expirations, and snapshots.
 * Returns real data from Alpaca Market Data API - NO mock data.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 * @see docs/plans/31-alpaca-data-consolidation.md
 */

import {
	type AlpacaMarketDataClient,
	type AlpacaOptionContract,
	type AlpacaOptionSnapshot,
	createAlpacaClientFromEnv,
	isAlpacaConfigured,
} from "@cream/marketdata";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import log from "../logger.js";

// ============================================
// Alpaca Client (singleton)
// ============================================

let alpacaClient: AlpacaMarketDataClient | null = null;

// ============================================
// Cache (configurable TTL)
// ============================================

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

const chainCache = new Map<string, CacheEntry<unknown>>();
const CHAIN_CACHE_TTL_MS = 60000; // 1 minute for chain structure
const QUOTE_CACHE_TTL_MS = 5000; // 5 seconds for quotes

function getCached<T>(key: string, ttlMs: number): T | undefined {
	const entry = chainCache.get(key);
	if (!entry) {
		return undefined;
	}
	if (Date.now() - entry.timestamp > ttlMs) {
		chainCache.delete(key);
		return undefined;
	}
	return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
	chainCache.set(key, { data, timestamp: Date.now() });
}

function getAlpacaClient(): AlpacaMarketDataClient {
	if (alpacaClient) {
		return alpacaClient;
	}

	if (!isAlpacaConfigured()) {
		throw new HTTPException(503, {
			message: "Options data service unavailable: ALPACA_KEY/ALPACA_SECRET not configured",
		});
	}

	try {
		alpacaClient = createAlpacaClientFromEnv();
		return alpacaClient;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Options data service unavailable: ${message}`,
		});
	}
}

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const OptionsContractSchema = z.object({
	symbol: z.string(),
	bid: z.number().nullable(),
	ask: z.number().nullable(),
	last: z.number().nullable(),
	volume: z.number().nullable(),
	openInterest: z.number().nullable(),
	impliedVolatility: z.number().nullable(),
});

const ChainRowSchema = z.object({
	strike: z.number(),
	call: OptionsContractSchema.nullable(),
	put: OptionsContractSchema.nullable(),
});

const OptionsChainResponseSchema = z.object({
	underlying: z.string(),
	underlyingPrice: z.number().nullable(),
	expirations: z.array(z.string()),
	atmStrike: z.number().nullable(),
	chain: z.array(ChainRowSchema),
});

const ExpirationSchema = z.object({
	date: z.string(),
	dte: z.number(),
	type: z.enum(["weekly", "monthly", "quarterly"]),
});

const ExpirationsResponseSchema = z.object({
	underlying: z.string(),
	expirations: z.array(ExpirationSchema),
});

const GreeksSchema = z.object({
	delta: z.number().nullable(),
	gamma: z.number().nullable(),
	theta: z.number().nullable(),
	vega: z.number().nullable(),
});

const OptionQuoteResponseSchema = z.object({
	symbol: z.string(),
	underlying: z.string(),
	expiration: z.string(),
	strike: z.number(),
	right: z.enum(["CALL", "PUT"]),
	bid: z.number().nullable(),
	ask: z.number().nullable(),
	last: z.number().nullable(),
	volume: z.number().nullable(),
	openInterest: z.number().nullable(),
	impliedVolatility: z.number().nullable(),
	greeks: GreeksSchema,
});

const ErrorSchema = z.object({
	error: z.string(),
	message: z.string(),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Parse a YYYY-MM-DD date string as local time (not UTC).
 * This avoids timezone issues where "2026-01-16" becomes Jan 15 in US timezones.
 */
function parseLocalDate(dateStr: string): Date {
	const [year, month, day] = dateStr.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function calculateDte(expirationDate: string): number {
	const expDate = parseLocalDate(expirationDate);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function classifyExpirationType(date: string): "weekly" | "monthly" | "quarterly" {
	const d = parseLocalDate(date);
	const dayOfWeek = d.getDay();
	const dayOfMonth = d.getDate();

	// Quarterly: third Friday of March, June, September, December
	const month = d.getMonth();
	if ([2, 5, 8, 11].includes(month) && dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21) {
		return "quarterly";
	}

	// Monthly: third Friday of month
	if (dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21) {
		return "monthly";
	}

	return "weekly";
}

function transformToContract(
	contract: AlpacaOptionContract,
	snapshot: AlpacaOptionSnapshot | undefined
): z.infer<typeof OptionsContractSchema> {
	const lastPrice = snapshot?.latestTrade?.price ?? contract.closePrice ?? null;

	return {
		symbol: contract.symbol,
		bid: snapshot?.latestQuote?.bidPrice ?? lastPrice,
		ask: snapshot?.latestQuote?.askPrice ?? lastPrice,
		last: lastPrice,
		volume: snapshot?.dailyBar?.volume ?? null,
		openInterest: contract.openInterest ?? null,
		impliedVolatility: snapshot?.impliedVolatility ?? null,
	};
}

// ============================================
// Routes
// ============================================

// GET /chain/:underlying - Options chain with structure
const chainRoute = createRoute({
	method: "get",
	path: "/chain/{underlying}",
	request: {
		params: z.object({
			underlying: z.string(),
		}),
		query: z.object({
			expiration: z.string().optional(),
			strikeRange: z.coerce.number().min(1).max(100).default(20),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: OptionsChainResponseSchema } },
			description: "Options chain for underlying",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Options data service unavailable",
		},
	},
	tags: ["Options"],
});

app.openapi(chainRoute, async (c) => {
	const { underlying } = c.req.valid("param");
	const { expiration, strikeRange } = c.req.valid("query");
	const upperUnderlying = underlying.toUpperCase();

	const cacheKey = `chain:${upperUnderlying}:${expiration ?? "all"}:${strikeRange}`;
	const cached = getCached<z.infer<typeof OptionsChainResponseSchema>>(
		cacheKey,
		CHAIN_CACHE_TTL_MS
	);
	if (cached) {
		return c.json(cached, 200);
	}

	const client = getAlpacaClient();

	try {
		// Get underlying price first
		const stockSnapshots = await client.getSnapshots([upperUnderlying]);
		const stockSnapshot = stockSnapshots.get(upperUnderlying);
		const underlyingPrice =
			stockSnapshot?.dailyBar?.close ?? stockSnapshot?.latestTrade?.price ?? null;

		// Calculate strike range bounds
		let strikePriceGte: number | undefined;
		let strikePriceLte: number | undefined;
		if (underlyingPrice) {
			const rangeMultiplier = strikeRange / 100;
			strikePriceGte = Math.floor(underlyingPrice * (1 - rangeMultiplier));
			strikePriceLte = Math.ceil(underlyingPrice * (1 + rangeMultiplier));
		}

		// Fetch option contracts
		const contracts = await client.getOptionContracts(upperUnderlying, {
			expirationDateGte: expiration,
			expirationDateLte: expiration,
			strikePriceGte,
			strikePriceLte,
			limit: 250,
		});

		if (contracts.length === 0) {
			// Return empty chain
			const emptyResponse = {
				underlying: upperUnderlying,
				underlyingPrice,
				expirations: [],
				atmStrike: null,
				chain: [],
			};
			setCache(cacheKey, emptyResponse);
			return c.json(emptyResponse, 200);
		}

		// Get snapshots for all contracts (quotes, greeks)
		const contractSymbols = contracts.map((c) => c.symbol);
		const optionSnapshots = await client.getOptionSnapshots(contractSymbols);

		// Extract unique expirations
		const expirationSet = new Set<string>();
		for (const contract of contracts) {
			if (contract.expirationDate) {
				expirationSet.add(contract.expirationDate);
			}
		}
		const expirations = Array.from(expirationSet).sort();

		// Group by strike
		const strikeMap = new Map<
			number,
			{
				call: z.infer<typeof OptionsContractSchema> | null;
				put: z.infer<typeof OptionsContractSchema> | null;
			}
		>();

		for (const contract of contracts) {
			const strike = contract.strikePrice;
			const snapshot = optionSnapshots.get(contract.symbol);
			const transformed = transformToContract(contract, snapshot);

			if (!strikeMap.has(strike)) {
				strikeMap.set(strike, { call: null, put: null });
			}

			const row = strikeMap.get(strike);
			if (!row) {
				continue;
			}
			if (contract.type === "call") {
				row.call = transformed;
			} else {
				row.put = transformed;
			}
		}

		// Build chain array sorted by strike
		const chain = Array.from(strikeMap.entries())
			.sort(([a], [b]) => a - b)
			.map(([strike, contractPair]) => ({
				strike,
				call: contractPair.call,
				put: contractPair.put,
			}));

		// Find ATM strike
		let atmStrike: number | null = null;
		if (underlyingPrice && chain.length > 0) {
			const strikes = chain.map((r) => r.strike);
			atmStrike = strikes.reduce((prev, curr) =>
				Math.abs(curr - underlyingPrice) < Math.abs(prev - underlyingPrice) ? curr : prev
			);
		}

		const response = {
			underlying: upperUnderlying,
			underlyingPrice,
			expirations,
			atmStrike,
			chain,
		};

		setCache(cacheKey, response);
		return c.json(response, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch options chain for ${upperUnderlying}: ${message}`,
		});
	}
});

// GET /expirations/:underlying - Available expiration dates
const expirationsRoute = createRoute({
	method: "get",
	path: "/expirations/{underlying}",
	request: {
		params: z.object({
			underlying: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: ExpirationsResponseSchema } },
			description: "Available expiration dates",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Options data service unavailable",
		},
	},
	tags: ["Options"],
});

app.openapi(expirationsRoute, async (c) => {
	const { underlying } = c.req.valid("param");
	const upperUnderlying = underlying.toUpperCase();

	const cacheKey = `expirations:${upperUnderlying}`;
	const cached = getCached<z.infer<typeof ExpirationsResponseSchema>>(cacheKey, CHAIN_CACHE_TTL_MS);
	if (cached) {
		return c.json(cached, 200);
	}

	const client = getAlpacaClient();

	try {
		// Use the client's getOptionExpirations which handles pagination
		// and queries multiple date ranges for high-volume symbols like TSLA
		const expirationDates = await client.getOptionExpirations(upperUnderlying);

		if (expirationDates.length === 0) {
			const emptyResponse = {
				underlying: upperUnderlying,
				expirations: [],
			};
			setCache(cacheKey, emptyResponse);
			return c.json(emptyResponse, 200);
		}

		// Build expirations array with DTE and type
		const expirations = expirationDates
			.map((date) => ({
				date,
				dte: calculateDte(date),
				type: classifyExpirationType(date),
			}))
			.filter((exp) => exp.dte >= 0); // Filter out expired

		const response = {
			underlying: upperUnderlying,
			expirations,
		};

		setCache(cacheKey, response);
		return c.json(response, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ underlying: upperUnderlying, error: message }, "Failed to fetch expirations");
		throw new HTTPException(503, {
			message: `Failed to fetch expirations for ${upperUnderlying}: ${message}`,
		});
	}
});

// GET /quote/:contract - Single option contract quote
const quoteRoute = createRoute({
	method: "get",
	path: "/quote/{contract}",
	request: {
		params: z.object({
			contract: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: OptionQuoteResponseSchema } },
			description: "Option contract quote with greeks",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Contract not found",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Options data service unavailable",
		},
	},
	tags: ["Options"],
});

app.openapi(quoteRoute, async (c) => {
	const { contract } = c.req.valid("param");
	const upperContract = contract.toUpperCase();

	const cacheKey = `quote:${upperContract}`;
	const cached = getCached<z.infer<typeof OptionQuoteResponseSchema>>(cacheKey, QUOTE_CACHE_TTL_MS);
	if (cached) {
		return c.json(cached, 200);
	}

	const client = getAlpacaClient();

	try {
		// Parse the OCC option symbol to extract underlying
		// Format: AAPL240119C00150000
		const match = upperContract.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
		if (!match) {
			throw new HTTPException(400, {
				message: `Invalid option contract format: ${upperContract}. Expected OCC format like AAPL240119C00150000`,
			});
		}

		const [, underlying, expStr, typeChar, strikeStr] = match;
		if (!underlying || !expStr || !typeChar || !strikeStr) {
			throw new HTTPException(400, {
				message: `Invalid option contract format: ${upperContract}`,
			});
		}

		const year = 2000 + Number.parseInt(expStr.slice(0, 2), 10);
		const month = expStr.slice(2, 4);
		const day = expStr.slice(4, 6);
		const expiration = `${year}-${month}-${day}`;
		const strike = Number.parseInt(strikeStr, 10) / 1000;

		// Get snapshot for this specific contract
		const snapshots = await client.getOptionSnapshots([upperContract]);
		const snapshot = snapshots.get(upperContract);

		if (!snapshot) {
			throw new HTTPException(404, {
				message: `Option contract not found: ${upperContract}`,
			});
		}

		const response = {
			symbol: upperContract,
			underlying,
			expiration,
			strike,
			right: (typeChar === "C" ? "CALL" : "PUT") as "CALL" | "PUT",
			bid: snapshot.latestQuote?.bidPrice ?? null,
			ask: snapshot.latestQuote?.askPrice ?? null,
			last: snapshot.latestTrade?.price ?? null,
			volume: snapshot.dailyBar?.volume ?? null,
			openInterest: null, // Alpaca doesn't provide OI in snapshots, only in contracts
			impliedVolatility: snapshot.impliedVolatility ?? null,
			greeks: {
				delta: snapshot.greeks?.delta ?? null,
				gamma: snapshot.greeks?.gamma ?? null,
				theta: snapshot.greeks?.theta ?? null,
				vega: snapshot.greeks?.vega ?? null,
			},
		};

		setCache(cacheKey, response);
		return c.json(response, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch quote for ${upperContract}: ${message}`,
		});
	}
});

// ============================================
// Export
// ============================================

export const optionsRoutes = app;
export default optionsRoutes;
