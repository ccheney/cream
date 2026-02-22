/**
 * Key economic releases tracked by the system.
 * Release IDs are from FRED's official release calendar.
 * @see https://fred.stlouisfed.org/releases/calendar
 */
export const FRED_RELEASES = {
	CPI: { id: 10, name: "Consumer Price Index", series: ["CPIAUCSL", "CPILFESL", "CPIUFDSL"] },
	EMPLOYMENT: { id: 50, name: "Employment Situation", series: ["PAYEMS", "UNRATE", "CIVPART"] },
	GDP: { id: 53, name: "Gross Domestic Product", series: ["GDPC1", "GDP", "A191RL1Q225SBEA"] },
	FOMC: { id: 101, name: "FOMC Press Release", series: ["FEDFUNDS", "DFEDTARU", "DFEDTARL"] },
	RETAIL_SALES: {
		id: 9,
		name: "Advance Monthly Sales for Retail and Food Services",
		series: ["RSAFS", "RSXFS"],
	},
	INDUSTRIAL_PRODUCTION: {
		id: 13,
		name: "G.17 Industrial Production and Capacity Utilization",
		series: ["INDPRO", "TCU", "CUMFNS"],
	},
	PERSONAL_INCOME: {
		id: 46,
		name: "Personal Income and Outlays",
		series: ["PCE", "PCEPI", "PI", "PSAVERT"],
	},
	TREASURY_RATES: {
		id: 18,
		name: "H.15 Selected Interest Rates",
		series: ["DGS10", "DGS2", "DGS30", "T10Y2Y"],
	},
	CONSUMER_SENTIMENT: { id: 14, name: "Surveys of Consumers", series: ["UMCSENT"] },
	HOUSING_STARTS: { id: 40, name: "New Residential Construction", series: ["HOUST", "PERMIT"] },
	DURABLE_GOODS: {
		id: 37,
		name: "Advance Report on Durable Goods",
		series: ["DGORDER", "NEWORDER"],
	},
	ISM_MANUFACTURING: {
		id: 29,
		name: "ISM Manufacturing: PMI Composite Index",
		series: ["MANEMP", "NAPM"],
	},
	TRADE_BALANCE: {
		id: 99,
		name: "U.S. International Trade in Goods and Services",
		series: ["BOPGSTB", "IEAXGS", "IEAMGS"],
	},
	PPI: { id: 11, name: "Producer Price Index", series: ["PPIACO", "PPIFGS", "PPIFIS"] },
	JOLTS: {
		id: 154,
		name: "Job Openings and Labor Turnover Survey",
		series: ["JTSJOL", "JTSQUR", "JTSHIR"],
	},
} as const;

export type FREDReleaseId = keyof typeof FRED_RELEASES;

/**
 * Data series metadata for common economic indicators.
 */
export const FRED_SERIES = {
	CPIAUCSL: { name: "CPI All Urban Consumers", unit: "index", frequency: "monthly" },
	CPILFESL: { name: "CPI Less Food and Energy", unit: "index", frequency: "monthly" },
	CPIUFDSL: { name: "CPI Food", unit: "index", frequency: "monthly" },
	PCEPI: { name: "PCE Price Index", unit: "index", frequency: "monthly" },
	PPIACO: { name: "PPI All Commodities", unit: "index", frequency: "monthly" },
	PPIFGS: { name: "PPI Finished Goods", unit: "index", frequency: "monthly" },
	PPIFIS: { name: "PPI Final Demand Services", unit: "index", frequency: "monthly" },
	PAYEMS: { name: "All Employees, Total Nonfarm", unit: "thousands", frequency: "monthly" },
	UNRATE: { name: "Unemployment Rate", unit: "percent", frequency: "monthly" },
	CIVPART: { name: "Labor Force Participation Rate", unit: "percent", frequency: "monthly" },
	JTSJOL: { name: "Job Openings", unit: "thousands", frequency: "monthly" },
	JTSQUR: { name: "Quits Rate", unit: "percent", frequency: "monthly" },
	JTSHIR: { name: "Hires", unit: "thousands", frequency: "monthly" },
	GDPC1: { name: "Real GDP", unit: "billions", frequency: "quarterly" },
	GDP: { name: "Nominal GDP", unit: "billions", frequency: "quarterly" },
	A191RL1Q225SBEA: { name: "Real GDP Growth Rate", unit: "percent", frequency: "quarterly" },
	INDPRO: { name: "Industrial Production Index", unit: "index", frequency: "monthly" },
	TCU: { name: "Capacity Utilization", unit: "percent", frequency: "monthly" },
	CUMFNS: { name: "Capacity Utilization Manufacturing", unit: "percent", frequency: "monthly" },
	PCE: { name: "Personal Consumption Expenditures", unit: "billions", frequency: "monthly" },
	PI: { name: "Personal Income", unit: "billions", frequency: "monthly" },
	PSAVERT: { name: "Personal Saving Rate", unit: "percent", frequency: "monthly" },
	RSAFS: { name: "Retail Sales", unit: "millions", frequency: "monthly" },
	RSXFS: { name: "Retail Sales Excluding Food Services", unit: "millions", frequency: "monthly" },
	UMCSENT: { name: "Consumer Sentiment", unit: "index", frequency: "monthly" },
	DGORDER: { name: "Durable Goods Orders", unit: "millions", frequency: "monthly" },
	NEWORDER: { name: "New Orders Nondefense Capital Goods", unit: "millions", frequency: "monthly" },
	FEDFUNDS: { name: "Federal Funds Rate", unit: "percent", frequency: "daily" },
	DFEDTARU: { name: "Fed Funds Target Upper", unit: "percent", frequency: "daily" },
	DFEDTARL: { name: "Fed Funds Target Lower", unit: "percent", frequency: "daily" },
	DGS10: { name: "10-Year Treasury", unit: "percent", frequency: "daily" },
	DGS2: { name: "2-Year Treasury", unit: "percent", frequency: "daily" },
	DGS30: { name: "30-Year Treasury", unit: "percent", frequency: "daily" },
	T10Y2Y: { name: "10Y-2Y Treasury Spread", unit: "percent", frequency: "daily" },
	HOUST: { name: "Housing Starts", unit: "thousands", frequency: "monthly" },
	PERMIT: { name: "Building Permits", unit: "thousands", frequency: "monthly" },
	MANEMP: { name: "Manufacturing Employment", unit: "thousands", frequency: "monthly" },
	NAPM: { name: "ISM Manufacturing PMI", unit: "index", frequency: "monthly" },
	BOPGSTB: { name: "Trade Balance Goods & Services", unit: "millions", frequency: "monthly" },
	IEAXGS: { name: "Exports of Goods & Services", unit: "billions", frequency: "monthly" },
	IEAMGS: { name: "Imports of Goods & Services", unit: "billions", frequency: "monthly" },
} as const;

export type FREDSeriesId = keyof typeof FRED_SERIES;

const HIGH_IMPACT_RELEASE_IDS = new Set([
	10, // CPI
	50, // Employment Situation
	53, // GDP
	101, // FOMC
	9, // Retail Sales
]);

const MEDIUM_IMPACT_RELEASE_IDS = new Set([
	13, // Industrial Production
	46, // Personal Income
	18, // Treasury Rates
	40, // Housing Starts
	37, // Durable Goods
	11, // PPI
	154, // JOLTS
]);

export type ReleaseImpact = "high" | "medium" | "low";

/**
 * Classifies the market impact of a FRED release.
 */
export function classifyReleaseImpact(releaseId: number): ReleaseImpact {
	if (HIGH_IMPACT_RELEASE_IDS.has(releaseId)) {
		return "high";
	}
	if (MEDIUM_IMPACT_RELEASE_IDS.has(releaseId)) {
		return "medium";
	}
	return "low";
}

/**
 * Gets the release metadata by release ID.
 */
export function getReleaseById(
	releaseId: number,
): { key: FREDReleaseId; name: string; series: readonly string[] } | undefined {
	for (const [key, release] of Object.entries(FRED_RELEASES)) {
		if (release.id === releaseId) {
			return { key: key as FREDReleaseId, name: release.name, series: release.series };
		}
	}
	return undefined;
}
