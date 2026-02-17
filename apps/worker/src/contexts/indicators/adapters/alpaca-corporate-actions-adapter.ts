/**
 * Alpaca Corporate Actions Adapter
 *
 * Fetches corporate actions from Alpaca Markets API.
 */

import type { AlpacaCorporateAction, AlpacaCorporateActionsClient } from "@cream/indicators";
import { z } from "zod";
import { log } from "../../../shared/logger.js";

const ALPACA_CORPORATE_ACTIONS_URL = "https://data.alpaca.markets/v1beta1/corporate-actions";

const AlpacaCorporateActionsItemSchema = z
	.object({
		symbol: z.string().optional(),
		ex_date: z.string().optional(),
		process_date: z.string().optional(),
		record_date: z.string().nullable().optional(),
		payment_date: z.string().nullable().optional(),
		payable_date: z.string().nullable().optional(),
		corporate_action_type: z.string().optional(),
		rate: z.number().optional(),
		cash: z.number().optional(),
		special: z.boolean().optional(),
		foreign: z.boolean().optional(),
		new_rate: z.number().optional(),
		old_rate: z.number().optional(),
		description: z.string().optional(),
	})
	.passthrough();

const AlpacaCorporateActionsResponseSchema = z.object({
	corporate_actions: z.record(z.string(), z.array(AlpacaCorporateActionsItemSchema)),
});

type CorporateActionItem = z.infer<typeof AlpacaCorporateActionsItemSchema>;

export class AlpacaCorporateActionsAdapter implements AlpacaCorporateActionsClient {
	private readonly apiKey: string;
	private readonly apiSecret: string;

	constructor(apiKey: string, apiSecret: string) {
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
	}

	async getCorporateActions(params: {
		symbol?: string;
		startDate?: string;
		endDate?: string;
		limit?: number;
	}): Promise<AlpacaCorporateAction[]> {
		const url = new URL(ALPACA_CORPORATE_ACTIONS_URL);
		if (params.symbol) {
			url.searchParams.set("symbols", params.symbol);
		}
		if (params.startDate) {
			url.searchParams.set("start", params.startDate);
		}
		if (params.endDate) {
			url.searchParams.set("end", params.endDate);
		}
		if (params.limit) {
			url.searchParams.set("limit", params.limit.toString());
		}

		const response = await fetch(url.toString(), {
			headers: {
				"APCA-API-KEY-ID": this.apiKey,
				"APCA-API-SECRET-KEY": this.apiSecret,
			},
		});

		if (!response.ok) {
			throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
		}

		const data = AlpacaCorporateActionsResponseSchema.parse(await response.json());
		return this.flattenCorporateActions(data.corporate_actions);
	}

	async getCorporateActionsForSymbols(
		symbols: string[],
		startDate: string,
		endDate: string,
	): Promise<AlpacaCorporateAction[]> {
		const url = new URL(ALPACA_CORPORATE_ACTIONS_URL);
		url.searchParams.set("symbols", symbols.join(","));
		url.searchParams.set("start", startDate);
		url.searchParams.set("end", endDate);

		const response = await fetch(url.toString(), {
			headers: {
				"APCA-API-KEY-ID": this.apiKey,
				"APCA-API-SECRET-KEY": this.apiSecret,
			},
		});

		if (!response.ok) {
			throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
		}

		const data = AlpacaCorporateActionsResponseSchema.parse(await response.json());
		return this.flattenCorporateActions(data.corporate_actions);
	}

	private resolveActionType(
		rawType: string,
		special?: boolean,
	): AlpacaCorporateAction["corporate_action_type"] {
		switch (rawType.toLowerCase()) {
			case "dividend":
			case "cash_dividend":
			case "cash_dividends":
				return special ? "SpecialDividend" : "Dividend";
			case "special_dividend":
			case "special_dividends":
				return "SpecialDividend";
			case "stock_split":
			case "stock_splits":
			case "forward_split":
			case "forward_splits":
				return "Split";
			case "reverse_split":
			case "reverse_splits":
				return "ReverseSplit";
			case "spinoff":
			case "spin_off":
				return "Spinoff";
			case "merger":
				return "Merger";
			case "acquisition":
				return "Acquisition";
			case "name_change":
			case "symbol_change":
				return "NameChange";
			default:
				return "Dividend";
		}
	}

	private resolveActionValue(item: CorporateActionItem): number {
		if (item.cash !== undefined) {
			return item.cash;
		}

		if (item.rate !== undefined) {
			return item.rate;
		}

		if (item.new_rate !== undefined && item.old_rate !== undefined) {
			return item.old_rate !== 0 ? item.new_rate / item.old_rate : 1;
		}

		return 0;
	}

	private toCorporateAction(
		typeKey: string,
		item: CorporateActionItem,
	): AlpacaCorporateAction | null {
		if (!item.symbol) {
			log.debug({ typeKey }, "Skipping corporate action: missing symbol");
			return null;
		}

		const exDate = item.ex_date ?? item.process_date;
		if (!exDate) {
			log.warn(
				{ typeKey, symbol: item.symbol },
				"Skipping corporate action: missing ex_date/process_date",
			);
			return null;
		}

		const actionType = this.resolveActionType(item.corporate_action_type ?? typeKey, item.special);
		const value = this.resolveActionValue(item);

		return {
			corporate_action_type: actionType,
			symbol: item.symbol,
			ex_date: exDate,
			record_date: item.record_date ?? null,
			payment_date: item.payment_date ?? item.payable_date ?? null,
			value,
			description: item.description,
		};
	}

	private flattenCorporateActions(
		actions: z.infer<typeof AlpacaCorporateActionsResponseSchema>["corporate_actions"],
	): AlpacaCorporateAction[] {
		const results: AlpacaCorporateAction[] = [];

		for (const [typeKey, items] of Object.entries(actions)) {
			for (const item of items) {
				const action = this.toCorporateAction(typeKey, item);
				if (action) {
					results.push(action);
				}
			}
		}

		return results;
	}
}

export function createAlpacaCorporateActionsFromEnv(): AlpacaCorporateActionsAdapter {
	const apiKey = Bun.env.ALPACA_KEY;
	const apiSecret = Bun.env.ALPACA_SECRET;
	if (!apiKey || !apiSecret) {
		throw new Error(
			"ALPACA_KEY and ALPACA_SECRET environment variables are required for corporate actions batch job",
		);
	}
	return new AlpacaCorporateActionsAdapter(apiKey, apiSecret);
}
