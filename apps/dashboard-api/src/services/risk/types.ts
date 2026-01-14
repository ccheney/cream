/**
 * Risk Service Types
 *
 * Shared types for risk calculation services.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 */

// ============================================
// Exposure Types
// ============================================

export interface ExposureMetrics {
	/** Gross exposure (|Long| + |Short|) */
	gross: {
		current: number;
		limit: number;
		pct: number;
	};
	/** Net exposure (Long - |Short|) */
	net: {
		current: number;
		limit: number;
		pct: number;
	};
	/** Total long exposure ($) */
	long: number;
	/** Total short exposure ($) (absolute value) */
	short: number;
	/** Highest concentration position */
	concentrationMax: {
		symbol: string;
		pct: number;
	};
	/** Sector exposure as percentage of NAV */
	sectorExposure: Record<string, number>;
}

// ============================================
// Position Types
// ============================================

export interface PositionForExposure {
	symbol: string;
	side: "LONG" | "SHORT";
	quantity: number;
	marketValue: number | null;
	sector?: string;
}

// ============================================
// Config Types
// ============================================

export interface ExposureLimits {
	maxGrossExposure: number;
	maxNetExposure: number;
	maxConcentration: number;
}

export const DEFAULT_EXPOSURE_LIMITS: ExposureLimits = {
	maxGrossExposure: 500000,
	maxNetExposure: 200000,
	maxConcentration: 0.25, // 25%
};

// ============================================
// Sector Mapping
// ============================================

/**
 * GICS sector mapping for common symbols.
 * This is a simplified mapping - in production would come from FMP or similar.
 */
export const SECTOR_MAPPING: Record<string, string> = {
	// Technology
	AAPL: "Technology",
	MSFT: "Technology",
	GOOGL: "Technology",
	GOOG: "Technology",
	META: "Technology",
	NVDA: "Technology",
	AMD: "Technology",
	INTC: "Technology",
	CRM: "Technology",
	ORCL: "Technology",
	ADBE: "Technology",
	CSCO: "Technology",
	AVGO: "Technology",
	QCOM: "Technology",
	TXN: "Technology",

	// Communication Services
	NFLX: "Communication Services",
	DIS: "Communication Services",
	CMCSA: "Communication Services",
	VZ: "Communication Services",
	T: "Communication Services",

	// Consumer Discretionary
	AMZN: "Consumer Discretionary",
	TSLA: "Consumer Discretionary",
	HD: "Consumer Discretionary",
	MCD: "Consumer Discretionary",
	NKE: "Consumer Discretionary",
	SBUX: "Consumer Discretionary",
	LOW: "Consumer Discretionary",
	TGT: "Consumer Discretionary",

	// Consumer Staples
	PG: "Consumer Staples",
	KO: "Consumer Staples",
	PEP: "Consumer Staples",
	WMT: "Consumer Staples",
	COST: "Consumer Staples",
	PM: "Consumer Staples",
	MO: "Consumer Staples",

	// Health Care
	JNJ: "Health Care",
	UNH: "Health Care",
	PFE: "Health Care",
	ABBV: "Health Care",
	MRK: "Health Care",
	LLY: "Health Care",
	TMO: "Health Care",
	BMY: "Health Care",

	// Financials
	JPM: "Financials",
	BAC: "Financials",
	WFC: "Financials",
	GS: "Financials",
	MS: "Financials",
	C: "Financials",
	AXP: "Financials",
	BLK: "Financials",
	V: "Financials",
	MA: "Financials",

	// Industrials
	BA: "Industrials",
	CAT: "Industrials",
	HON: "Industrials",
	UNP: "Industrials",
	UPS: "Industrials",
	RTX: "Industrials",
	GE: "Industrials",
	MMM: "Industrials",
	DE: "Industrials",

	// Energy
	XOM: "Energy",
	CVX: "Energy",
	COP: "Energy",
	SLB: "Energy",
	EOG: "Energy",
	OXY: "Energy",
	MPC: "Energy",
	VLO: "Energy",

	// Materials
	LIN: "Materials",
	APD: "Materials",
	SHW: "Materials",
	DD: "Materials",
	NEM: "Materials",
	FCX: "Materials",
	NUE: "Materials",

	// Real Estate
	AMT: "Real Estate",
	PLD: "Real Estate",
	CCI: "Real Estate",
	EQIX: "Real Estate",
	SPG: "Real Estate",
	O: "Real Estate",
	PSA: "Real Estate",

	// Utilities
	NEE: "Utilities",
	DUK: "Utilities",
	SO: "Utilities",
	D: "Utilities",
	AEP: "Utilities",
	EXC: "Utilities",
	XEL: "Utilities",

	// ETFs
	SPY: "ETF",
	QQQ: "ETF",
	IWM: "ETF",
	DIA: "ETF",
	VOO: "ETF",
	VTI: "ETF",
	XLF: "ETF",
	XLK: "ETF",
	XLE: "ETF",
	XLV: "ETF",
	XLI: "ETF",
	XLY: "ETF",
	XLP: "ETF",
	XLB: "ETF",
	XLU: "ETF",
	XLRE: "ETF",
};

/**
 * Get sector for a symbol.
 */
export function getSector(symbol: string): string {
	return SECTOR_MAPPING[symbol.toUpperCase()] ?? "Other";
}
