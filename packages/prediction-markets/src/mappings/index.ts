/**
 * Mappings Module
 *
 * Exports sector-specific market mappings for prediction markets.
 */

export {
	findRelatedInstruments,
	findSectorMatches,
	getAggregateImpact,
	getPrimarySector,
	getSectorETFs,
	type ImpactDirection,
	isHighVolatilityMarket,
	SECTOR_MAPPINGS,
	type Sector,
	type SectorMarketMapping,
	type SectorMatchResult,
	type VolatilityExpectation,
} from "./sector-markets";
