/**
 * FINRA Client Adapter
 *
 * Fetches short interest data from FINRA's public API.
 */

import type { FINRAClient, FINRAQueryRequest, FINRAShortInterestRecord } from "@cream/indicators";

const FINRA_API_URL = "https://api.finra.org/data/group/otcMarket/name/shortInterest";

export class FINRAClientAdapter implements FINRAClient {
	async queryShortInterest(request?: FINRAQueryRequest): Promise<FINRAShortInterestRecord[]> {
		const response = await fetch(FINRA_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				fields: [
					"symbolCode",
					"issueName",
					"marketClassCode",
					"settlementDate",
					"currentShortPositionQuantity",
					"previousShortPositionQuantity",
					"changePreviousNumber",
					"changePercent",
					"averageDailyVolumeQuantity",
					"daysToCoverQuantity",
					"stockSplitFlag",
					"revisionFlag",
				],
				compareFilters: request?.compareFilters?.map((f) => ({
					fieldName: f.fieldName,
					compareType: f.compareType,
					fieldValue: f.fieldValue,
				})),
				orFilters: request?.orFilters,
				limit: request?.limit ?? 100,
				offset: request?.offset ?? 0,
			}),
		});

		if (!response.ok) {
			throw new Error(`FINRA API error: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as Array<{
			symbolCode?: string;
			issueName?: string;
			marketClassCode?: string;
			settlementDate?: string;
			currentShortPositionQuantity?: number;
			previousShortPositionQuantity?: number;
			changePreviousNumber?: number;
			changePercent?: number;
			averageDailyVolumeQuantity?: number;
			daysToCoverQuantity?: number;
			stockSplitFlag?: string;
			revisionFlag?: string;
		}>;

		return data.map((record) => ({
			symbolCode: record.symbolCode ?? "",
			issueName: record.issueName ?? "",
			marketClassCode: record.marketClassCode ?? "",
			settlementDate: record.settlementDate ?? "",
			currentShortPositionQuantity: record.currentShortPositionQuantity ?? 0,
			previousShortPositionQuantity: record.previousShortPositionQuantity ?? null,
			changePreviousNumber: record.changePreviousNumber ?? null,
			changePercent: record.changePercent ?? null,
			averageDailyVolumeQuantity: record.averageDailyVolumeQuantity ?? null,
			daysToCoverQuantity: record.daysToCoverQuantity ?? null,
			stockSplitFlag: record.stockSplitFlag ?? null,
			revisionFlag: record.revisionFlag ?? null,
		}));
	}

	async getShortInterestBySymbols(
		symbols: string[],
		settlementDate?: string
	): Promise<FINRAShortInterestRecord[]> {
		const filters: FINRAQueryRequest["compareFilters"] = [
			{
				fieldName: "symbolCode",
				compareType: "IN",
				fieldValue: symbols,
			},
		];

		if (settlementDate) {
			filters.push({
				fieldName: "settlementDate",
				compareType: "EQUAL",
				fieldValue: settlementDate,
			});
		}

		return this.queryShortInterest({
			compareFilters: filters,
			limit: symbols.length * 2,
		});
	}

	async getLatestSettlementDate(): Promise<string> {
		const records = await this.queryShortInterest({ limit: 1 });
		if (records.length === 0) {
			throw new Error("No short interest records found to determine latest settlement date");
		}
		return records[0]?.settlementDate ?? "";
	}
}

export function createFINRAClient(): FINRAClientAdapter {
	return new FINRAClientAdapter();
}
