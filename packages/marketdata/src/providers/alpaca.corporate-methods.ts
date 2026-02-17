import type {
	AlpacaCorporateActionDividend,
	AlpacaCorporateActionSplit,
	AlpacaRequestFn,
} from "./alpaca.schemas";

export async function getStockSplits(
	request: AlpacaRequestFn,
	symbol: string,
): Promise<AlpacaCorporateActionSplit[]> {
	const splits: AlpacaCorporateActionSplit[] = [];
	try {
		const response = await request<{ corporate_actions: Record<string, unknown> }>(
			"/v1beta1/corporate-actions",
			{ symbols: symbol, types: "forward_split,reverse_split" },
		);
		const actions = response?.corporate_actions;
		if (!actions) {
			return splits;
		}
		const forwardSplits = actions.forward_splits as unknown[] | undefined;
		const reverseSplits = actions.reverse_splits as unknown[] | undefined;
		for (const split of [...(forwardSplits ?? []), ...(reverseSplits ?? [])]) {
			const s = split as Record<string, unknown>;
			splits.push({
				symbol: (s.symbol as string) ?? symbol,
				newRate: (s.new_rate as number) ?? 1,
				oldRate: (s.old_rate as number) ?? 1,
				processDate: (s.process_date as string) ?? "",
				exDate: (s.ex_date as string) ?? "",
				recordDate: s.record_date as string | undefined,
				payableDate: s.payable_date as string | undefined,
			});
		}
	} catch {
		return splits;
	}
	return splits;
}

export async function getDividends(
	request: AlpacaRequestFn,
	symbol: string,
): Promise<AlpacaCorporateActionDividend[]> {
	const dividends: AlpacaCorporateActionDividend[] = [];
	try {
		const response = await request<{ corporate_actions: Record<string, unknown> }>(
			"/v1beta1/corporate-actions",
			{ symbols: symbol, types: "cash_dividend" },
		);
		const actions = response?.corporate_actions;
		const cashDividends = actions?.cash_dividends as unknown[] | undefined;
		for (const dividend of cashDividends ?? []) {
			const d = dividend as Record<string, unknown>;
			dividends.push({
				symbol: (d.symbol as string) ?? symbol,
				rate: (d.rate as number) ?? 0,
				special: d.special as boolean | undefined,
				foreign: d.foreign as boolean | undefined,
				exDate: (d.ex_date as string) ?? "",
				recordDate: d.record_date as string | undefined,
				payableDate: d.payable_date as string | undefined,
				processDate: d.process_date as string | undefined,
			});
		}
	} catch {
		return dividends;
	}
	return dividends;
}
