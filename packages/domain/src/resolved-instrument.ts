/**
 * Resolved instrument metadata shared across data and graph services.
 */
export interface ResolvedInstrument {
	/** Ticker symbol */
	symbol: string;
	/** Source that provided this instrument */
	source: string;
	/** Company/ETF name */
	name?: string;
	/** Sector classification */
	sector?: string;
	/** Industry classification */
	industry?: string;
	/** Market capitalization */
	marketCap?: number;
	/** Average volume */
	avgVolume?: number;
	/** Current price */
	price?: number;
}
