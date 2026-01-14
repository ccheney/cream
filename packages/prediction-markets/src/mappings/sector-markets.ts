/**
 * Sector-Specific Market Mappings
 *
 * Maps prediction market events to specific sector tickers and instruments
 * for targeted trading signals.
 *
 * @see docs/plans/18-prediction-markets.md (Future Enhancements)
 */

// ============================================
// Types
// ============================================

/**
 * Impact direction of the market outcome
 */
export type ImpactDirection = "POSITIVE" | "NEGATIVE" | "MIXED";

/**
 * Expected volatility level
 */
export type VolatilityExpectation = "HIGH" | "MEDIUM" | "LOW";

/**
 * Sector classification
 */
export type Sector =
	| "HEALTHCARE"
	| "TECHNOLOGY"
	| "ENERGY"
	| "FINANCIALS"
	| "REAL_ESTATE"
	| "CONSUMER_DISCRETIONARY"
	| "CONSUMER_STAPLES"
	| "INDUSTRIALS"
	| "MATERIALS"
	| "UTILITIES"
	| "COMMUNICATION_SERVICES";

/**
 * Mapping from market pattern to sector and instruments
 */
export interface SectorMarketMapping {
	/** Pattern to match against market question/title */
	marketPattern: RegExp | string;
	/** Sector classification */
	sector: Sector;
	/** Related instruments (ETFs, stocks) */
	relatedInstruments: string[];
	/** Impact direction if outcome is positive */
	impactDirection: ImpactDirection;
	/** Expected volatility around the event */
	volatilityExpectation: VolatilityExpectation;
	/** Optional description */
	description?: string;
}

/**
 * Match result from findRelatedInstruments
 */
export interface SectorMatchResult {
	/** Matched sector */
	sector: Sector;
	/** Related instruments */
	instruments: string[];
	/** Impact direction */
	impactDirection: ImpactDirection;
	/** Volatility expectation */
	volatilityExpectation: VolatilityExpectation;
	/** Matched pattern description */
	matchedPattern: string;
}

// ============================================
// Sector Mappings
// ============================================

/**
 * Comprehensive sector mappings for prediction markets
 */
export const SECTOR_MAPPINGS: SectorMarketMapping[] = [
	// ============================================
	// Healthcare / Pharmaceuticals
	// ============================================
	{
		marketPattern: /FDA.*approv/i,
		sector: "HEALTHCARE",
		relatedInstruments: ["XLV", "IBB", "XBI", "VHT", "IHI"],
		impactDirection: "POSITIVE",
		volatilityExpectation: "HIGH",
		description: "FDA drug approval decisions",
	},
	{
		marketPattern: /drug.*trial|clinical.*trial/i,
		sector: "HEALTHCARE",
		relatedInstruments: ["XBI", "IBB", "ARKG"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "Clinical trial results",
	},
	{
		marketPattern: /medicare|medicaid|healthcare.*reform/i,
		sector: "HEALTHCARE",
		relatedInstruments: ["XLV", "VHT", "IHF", "XHS"],
		impactDirection: "MIXED",
		volatilityExpectation: "MEDIUM",
		description: "Healthcare policy changes",
	},

	// ============================================
	// Technology
	// ============================================
	{
		marketPattern: /antitrust|monopoly|breakup/i,
		sector: "TECHNOLOGY",
		relatedInstruments: ["XLK", "QQQ", "GOOGL", "META", "AAPL", "AMZN", "MSFT"],
		impactDirection: "NEGATIVE",
		volatilityExpectation: "HIGH",
		description: "Antitrust and competition decisions",
	},
	{
		marketPattern: /tech.*regulation|data.*privacy|GDPR|section.*230/i,
		sector: "TECHNOLOGY",
		relatedInstruments: ["XLK", "QQQ", "META", "GOOGL", "TWTR"],
		impactDirection: "NEGATIVE",
		volatilityExpectation: "MEDIUM",
		description: "Tech regulation and privacy",
	},
	{
		marketPattern: /AI.*regulation|artificial.*intelligence.*ban/i,
		sector: "TECHNOLOGY",
		relatedInstruments: ["NVDA", "MSFT", "GOOGL", "AMD", "BOTZ", "ARKQ"],
		impactDirection: "NEGATIVE",
		volatilityExpectation: "HIGH",
		description: "AI regulation",
	},
	{
		marketPattern: /semiconductor|chip.*ban|chip.*act/i,
		sector: "TECHNOLOGY",
		relatedInstruments: ["SMH", "SOXX", "NVDA", "AMD", "INTC", "TSM"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "Semiconductor policy",
	},

	// ============================================
	// Energy
	// ============================================
	{
		marketPattern: /oil|crude|petroleum|OPEC/i,
		sector: "ENERGY",
		relatedInstruments: ["XLE", "XOP", "OIH", "USO", "XOM", "CVX"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "Oil and petroleum markets",
	},
	{
		marketPattern: /natural.*gas|LNG/i,
		sector: "ENERGY",
		relatedInstruments: ["XLE", "UNG", "BOIL", "LNG"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "Natural gas markets",
	},
	{
		marketPattern: /climate|carbon|green.*new.*deal|paris.*agreement/i,
		sector: "ENERGY",
		relatedInstruments: ["ICLN", "TAN", "QCLN", "PBW", "SMOG"],
		impactDirection: "MIXED",
		volatilityExpectation: "MEDIUM",
		description: "Climate and carbon policy",
	},
	{
		marketPattern: /renewable|solar|wind.*energy/i,
		sector: "ENERGY",
		relatedInstruments: ["ICLN", "TAN", "FAN", "QCLN"],
		impactDirection: "POSITIVE",
		volatilityExpectation: "MEDIUM",
		description: "Renewable energy policy",
	},

	// ============================================
	// Financials / Federal Reserve
	// ============================================
	{
		marketPattern: /fed|fomc|rate.*cut|rate.*hike|interest.*rate/i,
		sector: "FINANCIALS",
		relatedInstruments: ["XLF", "KRE", "KBE", "TLT", "IYR", "VNQ"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "Federal Reserve policy",
	},
	{
		marketPattern: /bank.*regulation|dodd.*frank|basel/i,
		sector: "FINANCIALS",
		relatedInstruments: ["XLF", "KBE", "KRE", "IAT"],
		impactDirection: "MIXED",
		volatilityExpectation: "MEDIUM",
		description: "Banking regulation",
	},
	{
		marketPattern: /inflation|CPI|consumer.*price/i,
		sector: "FINANCIALS",
		relatedInstruments: ["TIP", "TLT", "IEF", "XLF", "GLD"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "Inflation indicators",
	},
	{
		marketPattern: /recession|GDP|economic.*growth/i,
		sector: "FINANCIALS",
		relatedInstruments: ["SPY", "QQQ", "IWM", "TLT", "GLD"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "Economic indicators",
	},

	// ============================================
	// Real Estate
	// ============================================
	{
		marketPattern: /housing|mortgage|home.*price/i,
		sector: "REAL_ESTATE",
		relatedInstruments: ["VNQ", "IYR", "XHB", "ITB", "REZ"],
		impactDirection: "MIXED",
		volatilityExpectation: "MEDIUM",
		description: "Housing market",
	},
	{
		marketPattern: /commercial.*real.*estate|office.*space/i,
		sector: "REAL_ESTATE",
		relatedInstruments: ["VNQ", "IYR", "XLRE"],
		impactDirection: "MIXED",
		volatilityExpectation: "MEDIUM",
		description: "Commercial real estate",
	},

	// ============================================
	// Consumer / Retail
	// ============================================
	{
		marketPattern: /tariff|trade.*war|import.*ban/i,
		sector: "CONSUMER_DISCRETIONARY",
		relatedInstruments: ["XLY", "XRT", "RTH", "FXI", "EEM"],
		impactDirection: "NEGATIVE",
		volatilityExpectation: "HIGH",
		description: "Trade and tariff policy",
	},
	{
		marketPattern: /retail.*sales|consumer.*spending/i,
		sector: "CONSUMER_DISCRETIONARY",
		relatedInstruments: ["XLY", "XRT", "AMZN", "WMT", "TGT"],
		impactDirection: "MIXED",
		volatilityExpectation: "MEDIUM",
		description: "Retail and consumer indicators",
	},

	// ============================================
	// Industrials / Infrastructure
	// ============================================
	{
		marketPattern: /infrastructure|highway|bridge|transit/i,
		sector: "INDUSTRIALS",
		relatedInstruments: ["XLI", "PAVE", "CAT", "DE", "URI"],
		impactDirection: "POSITIVE",
		volatilityExpectation: "MEDIUM",
		description: "Infrastructure spending",
	},
	{
		marketPattern: /defense|military.*spending|pentagon/i,
		sector: "INDUSTRIALS",
		relatedInstruments: ["ITA", "XAR", "LMT", "RTX", "NOC", "BA"],
		impactDirection: "POSITIVE",
		volatilityExpectation: "MEDIUM",
		description: "Defense and military",
	},

	// ============================================
	// Utilities
	// ============================================
	{
		marketPattern: /electric.*grid|power.*outage|utility.*regulation/i,
		sector: "UTILITIES",
		relatedInstruments: ["XLU", "VPU", "IDU"],
		impactDirection: "MIXED",
		volatilityExpectation: "LOW",
		description: "Utility regulation",
	},

	// ============================================
	// Geopolitical
	// ============================================
	{
		marketPattern: /china|taiwan|sino/i,
		sector: "TECHNOLOGY",
		relatedInstruments: ["FXI", "KWEB", "MCHI", "TSM", "BABA"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "China-related geopolitics",
	},
	{
		marketPattern: /russia|ukraine|sanctions/i,
		sector: "ENERGY",
		relatedInstruments: ["XLE", "RSX", "ERUS", "XOP", "UNG"],
		impactDirection: "MIXED",
		volatilityExpectation: "HIGH",
		description: "Russia/Ukraine situation",
	},
];

// ============================================
// Functions
// ============================================

/**
 * Find related instruments for a market based on question/title
 */
export function findRelatedInstruments(marketQuestion: string): string[] {
	const matches = SECTOR_MAPPINGS.filter((mapping) => {
		if (typeof mapping.marketPattern === "string") {
			return marketQuestion.toLowerCase().includes(mapping.marketPattern.toLowerCase());
		}
		return mapping.marketPattern.test(marketQuestion);
	});

	// Deduplicate instruments across matches
	return [...new Set(matches.flatMap((m) => m.relatedInstruments))];
}

/**
 * Find all matching sector mappings for a market question
 */
export function findSectorMatches(marketQuestion: string): SectorMatchResult[] {
	return SECTOR_MAPPINGS.filter((mapping) => {
		if (typeof mapping.marketPattern === "string") {
			return marketQuestion.toLowerCase().includes(mapping.marketPattern.toLowerCase());
		}
		return mapping.marketPattern.test(marketQuestion);
	}).map((mapping) => ({
		sector: mapping.sector,
		instruments: mapping.relatedInstruments,
		impactDirection: mapping.impactDirection,
		volatilityExpectation: mapping.volatilityExpectation,
		matchedPattern: mapping.description ?? String(mapping.marketPattern),
	}));
}

/**
 * Get the primary sector for a market question
 */
export function getPrimarySector(marketQuestion: string): Sector | null {
	const matches = findSectorMatches(marketQuestion);
	if (matches.length === 0) {
		return null;
	}

	// Return the sector with highest volatility expectation (most impactful)
	const volatilityOrder: Record<VolatilityExpectation, number> = {
		HIGH: 3,
		MEDIUM: 2,
		LOW: 1,
	};

	const sorted = matches.sort(
		(a, b) => volatilityOrder[b.volatilityExpectation] - volatilityOrder[a.volatilityExpectation]
	);
	return sorted[0]?.sector ?? null;
}

/**
 * Get sector ETFs only (filter out individual stocks)
 */
export function getSectorETFs(marketQuestion: string): string[] {
	const instruments = findRelatedInstruments(marketQuestion);

	// Known ETF tickers (curated list to filter out individual stocks)
	const knownETFs = new Set([
		"SPY",
		"QQQ",
		"IWM",
		"TLT",
		"GLD",
		"XLF",
		"XLK",
		"XLE",
		"XLV",
		"XLI",
		"XLU",
		"XLY",
		"XLP",
		"XLB",
		"XLRE",
		"XLC",
		"VNQ",
		"IYR",
		"IBB",
		"XBI",
		"SMH",
		"SOXX",
		"KRE",
		"KBE",
		"XOP",
		"OIH",
		"XHB",
		"ITB",
		"XRT",
		"ITA",
		"XAR",
		"VHT",
		"IHI",
		"IHF",
		"ICLN",
		"TAN",
		"FAN",
		"QCLN",
		"PBW",
		"PAVE",
		"VPU",
		"IDU",
		"FXI",
		"EEM",
		"KWEB",
		"MCHI",
		"TIP",
		"IEF",
		"UNG",
		"USO",
		"BOIL",
		"ARKG",
		"ARKQ",
		"BOTZ",
		"REZ",
	]);

	return instruments.filter((ticker) => knownETFs.has(ticker));
}

/**
 * Check if market has high volatility expectation
 */
export function isHighVolatilityMarket(marketQuestion: string): boolean {
	const matches = findSectorMatches(marketQuestion);
	return matches.some((m) => m.volatilityExpectation === "HIGH");
}

/**
 * Get aggregate impact direction for a market
 */
export function getAggregateImpact(marketQuestion: string): ImpactDirection {
	const matches = findSectorMatches(marketQuestion);
	if (matches.length === 0) {
		return "MIXED";
	}

	// If any is MIXED or we have both POSITIVE and NEGATIVE, return MIXED
	const directions = new Set(matches.map((m) => m.impactDirection));
	if (directions.has("MIXED")) {
		return "MIXED";
	}
	if (directions.size > 1) {
		return "MIXED";
	}

	return matches[0]?.impactDirection ?? "MIXED";
}
