/**
 * Macro Exposure Mastra Tool Definitions
 *
 * Tools for querying macro entity exposure from the HelixDB macro graph.
 * Enables agents to analyze how portfolios and individual companies are
 * affected by macro economic factors like interest rates, commodities,
 * currencies, and economic indicators.
 */

import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	getAvailableMacroFactors,
	getCompaniesAffectedByMacro,
	getCompanyMacroExposure,
	getMacroFactorsByCategory,
	getPortfolioMacroExposure,
} from "../implementations/macroExposure.js";

/**
 * Create ExecutionContext for tool invocation.
 */
function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

// ============================================
// Schemas
// ============================================

const MacroCategorySchema = z
	.enum([
		"INTEREST_RATES",
		"COMMODITIES",
		"CURRENCIES",
		"VOLATILITY",
		"CREDIT",
		"ECONOMIC_INDICATORS",
	])
	.describe("Category of macro economic factor");

const MacroExposureSchema = z.object({
	entityId: z.string().describe("Macro entity ID (e.g., 'fed_funds_rate')"),
	name: z.string().describe("Human-readable factor name"),
	description: z.string().describe("Description of the macro factor"),
	sensitivity: z.number().min(0).max(1).describe("Sensitivity score (0-1, 1 = highly sensitive)"),
	category: MacroCategorySchema,
});

const AggregatedExposureSchema = z.object({
	entityId: z.string().describe("Macro entity ID"),
	name: z.string().describe("Factor name"),
	category: MacroCategorySchema,
	avgSensitivity: z.number().describe("Average sensitivity across portfolio"),
	companyCount: z.number().describe("Number of companies exposed"),
	topExposed: z
		.array(z.object({ symbol: z.string(), sensitivity: z.number() }))
		.describe("Companies with highest sensitivity"),
});

const AffectedCompanySchema = z.object({
	symbol: z.string().describe("Company ticker symbol"),
	sensitivity: z.number().min(0).max(1).describe("Sensitivity to the macro factor"),
});

const MacroFactorSchema = z.object({
	entityId: z.string().describe("Macro entity ID"),
	name: z.string().describe("Factor name"),
	description: z.string().describe("Description"),
	category: MacroCategorySchema,
	frequency: z.string().describe("Data release frequency (MONTHLY, QUARTERLY, etc.)"),
	dataSymbol: z.string().optional().describe("Market data symbol if available"),
});

export const CompanyMacroExposureInputSchema = z.object({
	symbol: z
		.string()
		.min(1)
		.max(10)
		.describe("Company ticker symbol to query macro exposure for (e.g., 'JPM')"),
});

export const CompanyMacroExposureOutputSchema = z.object({
	symbol: z.string().describe("The queried company symbol"),
	exposures: z.array(MacroExposureSchema).describe("Macro factors affecting this company"),
	executionTimeMs: z.number().describe("Query execution time in milliseconds"),
});

export const PortfolioMacroExposureInputSchema = z.object({
	symbols: z
		.array(z.string().min(1).max(10))
		.min(1)
		.max(50)
		.describe("List of company ticker symbols to analyze (e.g., ['AAPL', 'JPM', 'XOM'])"),
});

export const PortfolioMacroExposureOutputSchema = z.object({
	symbols: z.array(z.string()).describe("Companies analyzed"),
	aggregatedExposures: z.array(AggregatedExposureSchema).describe("Aggregated exposure by factor"),
	executionTimeMs: z.number().describe("Query execution time in milliseconds"),
});

export const CompaniesAffectedInputSchema = z.object({
	macroEntityId: z
		.string()
		.min(1)
		.describe(
			"Macro entity ID to query (e.g., 'fed_funds_rate', 'oil_wti', 'vix'). Use list_macro_factors to see available factors."
		),
});

export const CompaniesAffectedOutputSchema = z.object({
	macroEntityId: z.string().describe("The macro factor ID"),
	name: z.string().describe("Human-readable factor name"),
	affectedCompanies: z.array(AffectedCompanySchema).describe("Companies affected by this factor"),
	executionTimeMs: z.number().describe("Query execution time in milliseconds"),
});

export const ListMacroFactorsInputSchema = z.object({
	category: MacroCategorySchema.optional().describe(
		"Optional category to filter by. If not provided, returns all factors."
	),
});

export const ListMacroFactorsOutputSchema = z.object({
	factors: z.array(MacroFactorSchema).describe("Available macro factors"),
	sectorsWithDefaults: z.array(z.string()).describe("Sectors with predefined sensitivity defaults"),
});

export type CompanyMacroExposureInput = z.infer<typeof CompanyMacroExposureInputSchema>;
export type CompanyMacroExposureOutput = z.infer<typeof CompanyMacroExposureOutputSchema>;
export type PortfolioMacroExposureInput = z.infer<typeof PortfolioMacroExposureInputSchema>;
export type PortfolioMacroExposureOutput = z.infer<typeof PortfolioMacroExposureOutputSchema>;
export type CompaniesAffectedInput = z.infer<typeof CompaniesAffectedInputSchema>;
export type CompaniesAffectedOutput = z.infer<typeof CompaniesAffectedOutputSchema>;
export type ListMacroFactorsInput = z.infer<typeof ListMacroFactorsInputSchema>;
export type ListMacroFactorsOutput = z.infer<typeof ListMacroFactorsOutputSchema>;

// ============================================
// Tool Definitions
// ============================================

export const companyMacroExposureTool = createTool({
	id: "company_macro_exposure",
	description: `Get macro factor exposures for a company.

Use this tool when you need to understand:
- How sensitive a company is to interest rate changes
- Whether a company is exposed to commodity price movements
- How currency fluctuations might affect a company
- Overall macro risk profile for a specific company

Returns sensitivity scores (0-1) for each macro factor:
- 1.0 = Highly sensitive (major price moves expected from factor changes)
- 0.5 = Moderate sensitivity
- 0.1 = Low sensitivity

Example queries:
- "What is JPM's exposure to interest rates?" → Check fed_funds_rate, treasury_10y sensitivity
- "How would rising oil prices affect XOM?" → Check oil_wti sensitivity
- "Is NVDA affected by the dollar?" → Check dxy, currency sensitivities

Categories of factors:
- INTEREST_RATES: Fed funds, Treasury yields, yield curve
- COMMODITIES: Oil (WTI), Gold, Copper
- CURRENCIES: DXY (dollar index), EUR/USD, USD/JPY
- VOLATILITY: VIX, MOVE index
- CREDIT: High yield spread, IG spread
- ECONOMIC_INDICATORS: GDP, CPI, unemployment, PMI

`,
	inputSchema: CompanyMacroExposureInputSchema,
	outputSchema: CompanyMacroExposureOutputSchema,
	execute: async (inputData): Promise<CompanyMacroExposureOutput> => {
		const ctx = createToolContext();
		return getCompanyMacroExposure(ctx, inputData.symbol);
	},
});

export const portfolioMacroExposureTool = createTool({
	id: "portfolio_macro_exposure",
	description: `Analyze macro factor exposure across a portfolio of companies.

Use this tool when you need to:
- Identify concentrated macro risks in a portfolio
- Find diversification opportunities (which factors are underrepresented)
- Understand aggregate portfolio sensitivity to macro changes
- Stress test portfolio against specific macro scenarios

Returns aggregated statistics across all companies:
- Average sensitivity per factor (weighted by occurrence)
- Number of companies exposed to each factor
- Top 3 most exposed companies per factor

Example queries:
- "What is my portfolio's exposure to interest rates?" → Check aggregated INTEREST_RATES factors
- "Which holdings are most affected by oil?" → See topExposed for oil_wti
- "Is the portfolio diversified across macro factors?" → Compare factor coverage

Interpretation:
- High avgSensitivity + high companyCount = Concentrated risk
- Low avgSensitivity + low companyCount = Diversified exposure
- High avgSensitivity + low companyCount = Idiosyncratic risk in few names

`,
	inputSchema: PortfolioMacroExposureInputSchema,
	outputSchema: PortfolioMacroExposureOutputSchema,
	execute: async (inputData): Promise<PortfolioMacroExposureOutput> => {
		const ctx = createToolContext();
		return getPortfolioMacroExposure(ctx, inputData.symbols);
	},
});

export const companiesAffectedByMacroTool = createTool({
	id: "companies_affected_by_macro",
	description: `Get companies affected by a specific macro factor.

Use this tool when you need to:
- Find all holdings impacted by a specific macro change (e.g., Fed rate hike)
- Identify which companies to watch when a macro indicator moves
- Build a watchlist based on macro sensitivity

Returns companies sorted by sensitivity (highest first).

Example queries:
- "Which companies are most affected by Fed rate changes?" → Query 'fed_funds_rate'
- "What stocks move with oil prices?" → Query 'oil_wti'
- "Which holdings are VIX-sensitive?" → Query 'vix'

Common macro entity IDs:
- Interest rates: fed_funds_rate, treasury_10y, treasury_2y, yield_curve
- Commodities: oil_wti, gold, copper
- Currencies: dxy, eurusd, usdjpy
- Volatility: vix, move
- Credit: hy_spread, ig_spread
- Economic: gdp, cpi, unemployment, pmi_manufacturing, pmi_services

Use list_macro_factors tool to see all available factors.`,
	inputSchema: CompaniesAffectedInputSchema,
	outputSchema: CompaniesAffectedOutputSchema,
	execute: async (inputData): Promise<CompaniesAffectedOutput> => {
		const ctx = createToolContext();
		return getCompaniesAffectedByMacro(ctx, inputData.macroEntityId);
	},
});

export const listMacroFactorsTool = createTool({
	id: "list_macro_factors",
	description: `List available macro factors that can be queried.

Use this tool to:
- Discover what macro factors are available for analysis
- Get entity IDs for use with other macro exposure tools
- See which sectors have default sensitivity mappings
- Understand the categories and frequencies of factors

Returns:
- factors: List of all macro factors with metadata
- sectorsWithDefaults: Sectors that have predefined sensitivity defaults

Categories:
- INTEREST_RATES: Central bank rates and Treasury yields
- COMMODITIES: Energy, metals, agricultural commodities
- CURRENCIES: Exchange rates and dollar indices
- VOLATILITY: Market fear gauges
- CREDIT: Credit spreads and risk appetite indicators
- ECONOMIC_INDICATORS: GDP, inflation, employment data

This tool does not require database access and works in all modes.`,
	inputSchema: ListMacroFactorsInputSchema,
	outputSchema: ListMacroFactorsOutputSchema,
	execute: async (inputData): Promise<ListMacroFactorsOutput> => {
		if (inputData.category) {
			const filtered = getMacroFactorsByCategory(inputData.category);
			return {
				factors: filtered,
				sectorsWithDefaults: Object.keys(
					// Import statically to avoid context issues
					{
						"Financial Services": {},
						Technology: {},
						Energy: {},
						"Basic Materials": {},
						"Consumer Cyclical": {},
						"Consumer Defensive": {},
						Healthcare: {},
						Utilities: {},
						"Real Estate": {},
						Industrials: {},
						"Communication Services": {},
					}
				),
			};
		}
		return getAvailableMacroFactors();
	},
});

/**
 * All macro exposure tools
 */
export const macroExposureTools = [
	companyMacroExposureTool,
	portfolioMacroExposureTool,
	companiesAffectedByMacroTool,
	listMacroFactorsTool,
];
