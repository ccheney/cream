import type { MacroEntity } from "@cream/helix-schema";

/**
 * Macro entity category for organization
 */
export type MacroCategory =
	| "INTEREST_RATES"
	| "COMMODITIES"
	| "CURRENCIES"
	| "VOLATILITY"
	| "CREDIT"
	| "ECONOMIC_INDICATORS";

/**
 * Predefined macro entity with category
 */
export interface PredefinedMacroEntity extends MacroEntity {
	category: MacroCategory;
	/** Symbol/ticker for data retrieval (e.g., "^TNX" for 10Y Treasury) */
	dataSymbol?: string;
}

/**
 * Standard macro entities that should be seeded
 */
export const PREDEFINED_MACRO_ENTITIES: PredefinedMacroEntity[] = [
	// Interest Rates
	{
		entity_id: "fed_funds_rate",
		name: "Federal Funds Rate",
		description: "Target interest rate set by the Federal Open Market Committee",
		frequency: "IRREGULAR",
		category: "INTEREST_RATES",
		dataSymbol: "FEDFUNDS",
	},
	{
		entity_id: "treasury_10y",
		name: "10-Year Treasury Yield",
		description: "Yield on 10-year US Treasury bonds, benchmark for long-term rates",
		frequency: "MONTHLY",
		category: "INTEREST_RATES",
		dataSymbol: "^TNX",
	},
	{
		entity_id: "treasury_2y",
		name: "2-Year Treasury Yield",
		description: "Yield on 2-year US Treasury bonds, sensitive to Fed policy",
		frequency: "MONTHLY",
		category: "INTEREST_RATES",
		dataSymbol: "^IRX",
	},
	{
		entity_id: "yield_curve",
		name: "Yield Curve (10Y-2Y)",
		description: "Spread between 10Y and 2Y Treasury yields, recession indicator",
		frequency: "MONTHLY",
		category: "INTEREST_RATES",
	},

	// Commodities
	{
		entity_id: "oil_wti",
		name: "WTI Crude Oil",
		description: "West Texas Intermediate crude oil price, energy sector driver",
		frequency: "MONTHLY",
		category: "COMMODITIES",
		dataSymbol: "CL=F",
	},
	{
		entity_id: "gold",
		name: "Gold",
		description: "Gold spot price, safe-haven asset and inflation hedge",
		frequency: "MONTHLY",
		category: "COMMODITIES",
		dataSymbol: "GC=F",
	},
	{
		entity_id: "copper",
		name: "Copper",
		description: "Copper price, industrial activity indicator (Dr. Copper)",
		frequency: "MONTHLY",
		category: "COMMODITIES",
		dataSymbol: "HG=F",
	},

	// Currencies
	{
		entity_id: "dxy",
		name: "US Dollar Index (DXY)",
		description: "Trade-weighted index of US dollar vs major currencies",
		frequency: "MONTHLY",
		category: "CURRENCIES",
		dataSymbol: "DX-Y.NYB",
	},
	{
		entity_id: "eurusd",
		name: "EUR/USD",
		description: "Euro to US Dollar exchange rate",
		frequency: "MONTHLY",
		category: "CURRENCIES",
		dataSymbol: "EURUSD=X",
	},
	{
		entity_id: "usdjpy",
		name: "USD/JPY",
		description: "US Dollar to Japanese Yen exchange rate, carry trade indicator",
		frequency: "MONTHLY",
		category: "CURRENCIES",
		dataSymbol: "USDJPY=X",
	},

	// Volatility
	{
		entity_id: "vix",
		name: "VIX",
		description: "CBOE Volatility Index, market fear gauge",
		frequency: "MONTHLY",
		category: "VOLATILITY",
		dataSymbol: "^VIX",
	},
	{
		entity_id: "move",
		name: "MOVE Index",
		description: "Bond market volatility index",
		frequency: "MONTHLY",
		category: "VOLATILITY",
	},

	// Credit
	{
		entity_id: "hy_spread",
		name: "High Yield Spread",
		description: "Spread between high yield bonds and treasuries, risk appetite indicator",
		frequency: "MONTHLY",
		category: "CREDIT",
	},
	{
		entity_id: "ig_spread",
		name: "Investment Grade Spread",
		description: "Spread between investment grade bonds and treasuries",
		frequency: "MONTHLY",
		category: "CREDIT",
	},

	// Economic Indicators
	{
		entity_id: "gdp",
		name: "GDP Growth",
		description: "US Gross Domestic Product growth rate",
		frequency: "QUARTERLY",
		category: "ECONOMIC_INDICATORS",
		dataSymbol: "GDP",
	},
	{
		entity_id: "cpi",
		name: "Consumer Price Index",
		description: "Inflation measure based on consumer prices",
		frequency: "MONTHLY",
		category: "ECONOMIC_INDICATORS",
		dataSymbol: "CPIAUCSL",
	},
	{
		entity_id: "unemployment",
		name: "Unemployment Rate",
		description: "US unemployment rate",
		frequency: "MONTHLY",
		category: "ECONOMIC_INDICATORS",
		dataSymbol: "UNRATE",
	},
	{
		entity_id: "pmi_manufacturing",
		name: "ISM Manufacturing PMI",
		description: "Purchasing Managers Index for manufacturing sector",
		frequency: "MONTHLY",
		category: "ECONOMIC_INDICATORS",
	},
	{
		entity_id: "pmi_services",
		name: "ISM Services PMI",
		description: "Purchasing Managers Index for services sector",
		frequency: "MONTHLY",
		category: "ECONOMIC_INDICATORS",
	},
];

/**
 * Default sensitivities by sector to common macro factors
 * Values are approximate and should be refined with actual data
 */
export const SECTOR_DEFAULT_SENSITIVITIES: Record<string, Record<string, number>> = {
	"Financial Services": {
		fed_funds_rate: 0.9,
		treasury_10y: 0.85,
		treasury_2y: 0.8,
		yield_curve: 0.8,
		hy_spread: 0.7,
		ig_spread: 0.6,
	},
	Technology: {
		treasury_10y: 0.7,
		dxy: 0.5,
		vix: 0.6,
		gdp: 0.5,
	},
	Energy: {
		oil_wti: 0.95,
		dxy: 0.6,
		gdp: 0.6,
	},
	"Basic Materials": {
		copper: 0.8,
		gold: 0.6,
		dxy: 0.5,
		gdp: 0.6,
	},
	"Consumer Cyclical": {
		unemployment: 0.7,
		gdp: 0.7,
		cpi: 0.5,
	},
	"Consumer Defensive": {
		cpi: 0.6,
		unemployment: 0.4,
	},
	Healthcare: {
		treasury_10y: 0.4,
		gdp: 0.3,
	},
	Utilities: {
		treasury_10y: 0.8,
		fed_funds_rate: 0.7,
	},
	"Real Estate": {
		treasury_10y: 0.9,
		fed_funds_rate: 0.85,
		yield_curve: 0.6,
	},
	Industrials: {
		copper: 0.6,
		pmi_manufacturing: 0.8,
		gdp: 0.65,
		oil_wti: 0.5,
	},
	"Communication Services": {
		treasury_10y: 0.5,
		gdp: 0.5,
	},
};
