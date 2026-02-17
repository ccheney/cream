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

let alpacaClient: AlpacaMarketDataClient | null = null;

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

const chainCache = new Map<string, CacheEntry<unknown>>();
const CHAIN_CACHE_TTL_MS = 60000;
const QUOTE_CACHE_TTL_MS = 5000;

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
		throw new HTTPException(503, { message: `Options data service unavailable: ${message}` });
	}
}

const app = new OpenAPIHono();

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

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

type OptionsChainResponse = z.infer<typeof OptionsChainResponseSchema>;
type OptionQuoteResponse = z.infer<typeof OptionQuoteResponseSchema>;
type OptionsContract = z.infer<typeof OptionsContractSchema>;

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
	const month = d.getMonth();
	if ([2, 5, 8, 11].includes(month) && dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21) {
		return "quarterly";
	}
	if (dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21) {
		return "monthly";
	}
	return "weekly";
}

function transformToContract(
	contract: AlpacaOptionContract,
	snapshot: AlpacaOptionSnapshot | undefined,
): OptionsContract {
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

function getStrikeBounds(underlyingPrice: number | null, strikeRange: number) {
	if (!underlyingPrice) {
		return {};
	}
	const rangeMultiplier = strikeRange / 100;
	return {
		strikePriceGte: Math.floor(underlyingPrice * (1 - rangeMultiplier)),
		strikePriceLte: Math.ceil(underlyingPrice * (1 + rangeMultiplier)),
	};
}

function collectExpirations(contracts: AlpacaOptionContract[]): string[] {
	const expirationSet = new Set<string>();
	for (const contract of contracts) {
		if (contract.expirationDate) {
			expirationSet.add(contract.expirationDate);
		}
	}
	return Array.from(expirationSet).toSorted();
}

function buildStrikeMap(
	contracts: AlpacaOptionContract[],
	snapshots: Map<string, AlpacaOptionSnapshot>,
): Map<number, { call: OptionsContract | null; put: OptionsContract | null }> {
	const strikeMap = new Map<
		number,
		{ call: OptionsContract | null; put: OptionsContract | null }
	>();
	for (const contract of contracts) {
		const strike = contract.strikePrice;
		const row = strikeMap.get(strike) ?? { call: null, put: null };
		const transformed = transformToContract(contract, snapshots.get(contract.symbol));
		if (contract.type === "call") {
			row.call = transformed;
		} else {
			row.put = transformed;
		}
		strikeMap.set(strike, row);
	}
	return strikeMap;
}

function findAtmStrike(
	chain: z.infer<typeof ChainRowSchema>[],
	underlyingPrice: number | null,
): number | null {
	if (!underlyingPrice || chain.length === 0) {
		return null;
	}
	return chain
		.map((row) => row.strike)
		.reduce((prev, curr) =>
			Math.abs(curr - underlyingPrice) < Math.abs(prev - underlyingPrice) ? curr : prev,
		);
}

async function fetchChainResponse(
	client: AlpacaMarketDataClient,
	upperUnderlying: string,
	expiration: string | undefined,
	strikeRange: number,
): Promise<OptionsChainResponse> {
	const stockSnapshots = await client.getSnapshots([upperUnderlying]);
	const stockSnapshot = stockSnapshots.get(upperUnderlying);
	const underlyingPrice =
		stockSnapshot?.dailyBar?.close ?? stockSnapshot?.latestTrade?.price ?? null;
	const strikeBounds = getStrikeBounds(underlyingPrice, strikeRange);
	const contracts = await client.getOptionContracts(upperUnderlying, {
		expirationDateGte: expiration,
		expirationDateLte: expiration,
		...strikeBounds,
		limit: 250,
	});
	if (contracts.length === 0) {
		return {
			underlying: upperUnderlying,
			underlyingPrice,
			expirations: [],
			atmStrike: null,
			chain: [],
		};
	}
	const optionSnapshots = await client.getOptionSnapshots(contracts.map((c) => c.symbol));
	const chain = Array.from(buildStrikeMap(contracts, optionSnapshots).entries())
		.sort(([a], [b]) => a - b)
		.map(([strike, contractPair]) => ({ strike, call: contractPair.call, put: contractPair.put }));
	return {
		underlying: upperUnderlying,
		underlyingPrice,
		expirations: collectExpirations(contracts),
		atmStrike: findAtmStrike(chain, underlyingPrice),
		chain,
	};
}

interface ParsedOccContract {
	underlying: string;
	expiration: string;
	strike: number;
	right: "CALL" | "PUT";
}

function parseOccContractSymbol(contract: string): ParsedOccContract {
	const match = contract.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
	if (!match) {
		throw new HTTPException(400, {
			message: `Invalid option contract format: ${contract}. Expected OCC format like AAPL240119C00150000`,
		});
	}
	const [, underlying, expStr, typeChar, strikeStr] = match;
	if (!underlying || !expStr || !typeChar || !strikeStr) {
		throw new HTTPException(400, { message: `Invalid option contract format: ${contract}` });
	}
	const year = 2000 + Number.parseInt(expStr.slice(0, 2), 10);
	return {
		underlying,
		expiration: `${year}-${expStr.slice(2, 4)}-${expStr.slice(4, 6)}`,
		strike: Number.parseInt(strikeStr, 10) / 1000,
		right: typeChar === "C" ? "CALL" : "PUT",
	};
}

async function fetchOptionQuote(
	client: AlpacaMarketDataClient,
	upperContract: string,
): Promise<OptionQuoteResponse> {
	const parsed = parseOccContractSymbol(upperContract);
	const snapshot = (await client.getOptionSnapshots([upperContract])).get(upperContract);
	if (!snapshot) {
		throw new HTTPException(404, { message: `Option contract not found: ${upperContract}` });
	}
	return {
		symbol: upperContract,
		underlying: parsed.underlying,
		expiration: parsed.expiration,
		strike: parsed.strike,
		right: parsed.right,
		bid: snapshot.latestQuote?.bidPrice ?? null,
		ask: snapshot.latestQuote?.askPrice ?? null,
		last: snapshot.latestTrade?.price ?? null,
		volume: snapshot.dailyBar?.volume ?? null,
		openInterest: null,
		impliedVolatility: snapshot.impliedVolatility ?? null,
		greeks: {
			delta: snapshot.greeks?.delta ?? null,
			gamma: snapshot.greeks?.gamma ?? null,
			theta: snapshot.greeks?.theta ?? null,
			vega: snapshot.greeks?.vega ?? null,
		},
	};
}

const chainRoute = createRoute({
	method: "get",
	path: "/chain/{underlying}",
	request: {
		params: z.object({ underlying: z.string() }),
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
	const cached = getCached<OptionsChainResponse>(cacheKey, CHAIN_CACHE_TTL_MS);
	if (cached) {
		return c.json(cached, 200);
	}
	try {
		const response = await fetchChainResponse(
			getAlpacaClient(),
			upperUnderlying,
			expiration,
			strikeRange,
		);
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

const expirationsRoute = createRoute({
	method: "get",
	path: "/expirations/{underlying}",
	request: { params: z.object({ underlying: z.string() }) },
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
	try {
		const expirationDates = await getAlpacaClient().getOptionExpirations(upperUnderlying);
		const response = {
			underlying: upperUnderlying,
			expirations: expirationDates
				.map((date) => ({ date, dte: calculateDte(date), type: classifyExpirationType(date) }))
				.filter((exp) => exp.dte >= 0),
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

const quoteRoute = createRoute({
	method: "get",
	path: "/quote/{contract}",
	request: { params: z.object({ contract: z.string() }) },
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
	const cached = getCached<OptionQuoteResponse>(cacheKey, QUOTE_CACHE_TTL_MS);
	if (cached) {
		return c.json(cached, 200);
	}
	try {
		const response = await fetchOptionQuote(getAlpacaClient(), upperContract);
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

export const optionsRoutes = app;
export default optionsRoutes;
