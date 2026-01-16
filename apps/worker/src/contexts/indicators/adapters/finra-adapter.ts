/**
 * FINRA Client Adapter
 *
 * Fetches daily short sale volume data from FINRA's regShoDaily API.
 * Covers NYSE, NASDAQ, CBOE and other exchange-listed securities.
 * Requires OAuth 2.0 authentication with client credentials.
 *
 * Note: This provides daily short sale VOLUME (trading activity), not short INTEREST
 * (outstanding positions). Short interest for exchange-listed stocks is only available
 * as downloadable files from FINRA's website, not via their API.
 *
 * @see https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data
 * @see https://developer.finra.org/docs
 */

import type { FINRAClient, FINRAQueryRequest, FINRAShortInterestRecord } from "@cream/indicators";
import { log } from "../../../shared/logger.js";

const FINRA_API_URL = "https://api.finra.org/data/group/OTCMarket/name/regShoDaily";
const FINRA_TOKEN_URL =
	"https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials";

interface TokenCache {
	accessToken: string;
	expiresAt: number;
}

/** Raw record from FINRA regShoDaily API */
interface RegShoDailyRecord {
	tradeReportDate: string;
	securitiesInformationProcessorSymbolIdentifier: string;
	shortParQuantity: number;
	shortExemptParQuantity: number;
	totalParQuantity: number;
	marketCode: string;
	reportingFacilityCode: string;
}

/** Aggregated record per symbol/date */
interface AggregatedShortVolume {
	symbol: string;
	tradeDate: string;
	shortVolume: number;
	shortExemptVolume: number;
	totalVolume: number;
	shortVolumeRatio: number;
}

export class FINRAClientAdapter implements FINRAClient {
	private readonly clientId: string;
	private readonly clientSecret: string;
	private tokenCache: TokenCache | null = null;

	constructor(clientId?: string, clientSecret?: string) {
		this.clientId = clientId ?? Bun.env.FINRA_CLIENT_ID ?? "";
		this.clientSecret = clientSecret ?? Bun.env.FINRA_CLIENT_SECRET ?? "";

		if (!this.clientId || !this.clientSecret) {
			log.warn({}, "FINRA credentials not configured. Short volume fetching will fail.");
		}
	}

	private async getAccessToken(): Promise<string> {
		// Check cache - refresh 5 minutes before expiry
		if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 5 * 60 * 1000) {
			return this.tokenCache.accessToken;
		}

		if (!this.clientId || !this.clientSecret) {
			throw new Error(
				"FINRA credentials not configured. Set FINRA_CLIENT_ID and FINRA_CLIENT_SECRET."
			);
		}

		const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

		const response = await fetch(FINRA_TOKEN_URL, {
			method: "POST",
			headers: {
				Authorization: `Basic ${credentials}`,
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`FINRA OAuth error: ${response.status} ${response.statusText} - ${text}`);
		}

		const data = (await response.json()) as {
			access_token: string;
			expires_in: string | number;
			token_type: string;
		};

		const expiresIn =
			typeof data.expires_in === "string" ? Number.parseInt(data.expires_in, 10) : data.expires_in;

		this.tokenCache = {
			accessToken: data.access_token,
			expiresAt: Date.now() + expiresIn * 1000,
		};

		log.debug({ expiresIn }, "FINRA OAuth token obtained");

		return data.access_token;
	}

	/**
	 * Aggregate raw records by symbol and date.
	 * FINRA returns multiple records per symbol (one per reporting facility).
	 */
	private aggregateRecords(records: RegShoDailyRecord[]): AggregatedShortVolume[] {
		const aggregated = new Map<string, AggregatedShortVolume>();

		for (const record of records) {
			const key = `${record.securitiesInformationProcessorSymbolIdentifier}|${record.tradeReportDate}`;
			const existing = aggregated.get(key);

			if (existing) {
				existing.shortVolume += record.shortParQuantity;
				existing.shortExemptVolume += record.shortExemptParQuantity;
				existing.totalVolume += record.totalParQuantity;
			} else {
				aggregated.set(key, {
					symbol: record.securitiesInformationProcessorSymbolIdentifier,
					tradeDate: record.tradeReportDate,
					shortVolume: record.shortParQuantity,
					shortExemptVolume: record.shortExemptParQuantity,
					totalVolume: record.totalParQuantity,
					shortVolumeRatio: 0,
				});
			}
		}

		// Calculate ratios
		for (const agg of aggregated.values()) {
			agg.shortVolumeRatio = agg.totalVolume > 0 ? agg.shortVolume / agg.totalVolume : 0;
		}

		return Array.from(aggregated.values());
	}

	async queryShortInterest(request?: FINRAQueryRequest): Promise<FINRAShortInterestRecord[]> {
		const token = await this.getAccessToken();

		// Build request body according to FINRA API spec
		const body: Record<string, unknown> = {
			limit: request?.limit ?? 100,
			offset: request?.offset ?? 0,
		};

		// Process filters - convert "IN" to domainFilters, others to compareFilters
		if (request?.compareFilters && request.compareFilters.length > 0) {
			const compareFilters: Array<{
				fieldName: string;
				compareType: string;
				fieldValue: string;
			}> = [];
			const domainFilters: Array<{ fieldName: string; values: string[] }> = [];

			for (const f of request.compareFilters) {
				// Map generic field names to regShoDaily field names
				let fieldName = f.fieldName;
				if (fieldName === "symbolCode" || fieldName === "issueSymbolIdentifier") {
					fieldName = "securitiesInformationProcessorSymbolIdentifier";
				} else if (fieldName === "settlementDate") {
					fieldName = "tradeReportDate";
				}

				if (f.compareType === "IN" && Array.isArray(f.fieldValue)) {
					domainFilters.push({
						fieldName,
						values: f.fieldValue,
					});
				} else {
					compareFilters.push({
						fieldName,
						compareType: f.compareType === "EQUAL" ? "EQUAL" : f.compareType,
						fieldValue: String(f.fieldValue),
					});
				}
			}

			if (compareFilters.length > 0) {
				body.compareFilters = compareFilters;
			}
			if (domainFilters.length > 0) {
				body.domainFilters = domainFilters;
			}
		}

		const response = await fetch(FINRA_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`FINRA API error: ${response.status} ${response.statusText} - ${text}`);
		}

		const data = (await response.json()) as RegShoDailyRecord[] | null;

		if (!data || data.length === 0) {
			return [];
		}

		// Aggregate by symbol and date
		const aggregated = this.aggregateRecords(data);

		// Map to FINRAShortInterestRecord interface for compatibility
		return aggregated.map((agg) => ({
			symbolCode: agg.symbol,
			issueName: "", // Not available in regShoDaily
			marketClassCode: "", // Would need to aggregate from individual records
			settlementDate: agg.tradeDate,
			currentShortPositionQuantity: agg.shortVolume, // Using short volume as proxy
			previousShortPositionQuantity: null,
			changePreviousNumber: null,
			changePercent: null,
			averageDailyVolumeQuantity: agg.totalVolume,
			daysToCoverQuantity: agg.shortVolumeRatio, // Using ratio as proxy for days to cover
			stockSplitFlag: null,
			revisionFlag: null,
		}));
	}

	async getShortInterestBySymbols(
		symbols: string[],
		settlementDate?: string
	): Promise<FINRAShortInterestRecord[]> {
		const filters: FINRAQueryRequest["compareFilters"] = [
			{
				fieldName: "securitiesInformationProcessorSymbolIdentifier",
				compareType: "IN",
				fieldValue: symbols,
			},
		];

		if (settlementDate) {
			filters.push({
				fieldName: "tradeReportDate",
				compareType: "EQUAL",
				fieldValue: settlementDate,
			});
		}

		// Request more records since each symbol has multiple reporting facilities
		return this.queryShortInterest({
			compareFilters: filters,
			limit: symbols.length * 10,
		});
	}

	async getLatestSettlementDate(): Promise<string> {
		const records = await this.queryShortInterest({ limit: 1 });
		if (records.length === 0) {
			throw new Error("No short sale volume records found to determine latest trade date");
		}
		return records[0]?.settlementDate ?? "";
	}
}

export function createFINRAClient(clientId?: string, clientSecret?: string): FINRAClientAdapter {
	return new FINRAClientAdapter(clientId, clientSecret);
}
