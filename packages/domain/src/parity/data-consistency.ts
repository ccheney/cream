import { z } from "zod";

export const DataSourceMetadataSchema = z.object({
	provider: z.string(),
	feedType: z.enum(["historical", "realtime"]),
	adjusted: z.boolean(),
	startDate: z.string().datetime(),
	endDate: z.string().datetime(),
	symbols: z.array(z.string()),
});

export type DataSourceMetadata = z.infer<typeof DataSourceMetadataSchema>;

export interface DataConsistencyResult {
	consistent: boolean;
	issues: Array<{
		type: "provider_mismatch" | "adjustment_mismatch" | "survivorship_bias" | "data_gap";
		description: string;
		severity: "error" | "warning";
	}>;
	recommendations: string[];
}

export function validateDataConsistency(
	historical: DataSourceMetadata,
	realtime: DataSourceMetadata,
	delistedSymbols: string[] = [],
): DataConsistencyResult {
	const issues: DataConsistencyResult["issues"] = [];
	const recommendations: string[] = [];

	if (historical.provider !== realtime.provider) {
		issues.push({
			type: "provider_mismatch",
			description: `Historical data from ${historical.provider}, real-time from ${realtime.provider}. Data may differ.`,
			severity: "warning",
		});
		recommendations.push(
			`Consider using same provider (${realtime.provider}) for both historical and real-time data.`,
		);
	}

	if (historical.adjusted !== realtime.adjusted) {
		issues.push({
			type: "adjustment_mismatch",
			description: `Historical data adjusted=${historical.adjusted}, real-time adjusted=${realtime.adjusted}.`,
			severity: "error",
		});
		recommendations.push("Ensure both data sources use same adjustment setting.");
	}

	const historicalSymbols = new Set(historical.symbols);
	for (const symbol of delistedSymbols) {
		if (!historicalSymbols.has(symbol)) {
			issues.push({
				type: "survivorship_bias",
				description: `Delisted symbol ${symbol} not included in historical data. May introduce survivorship bias.`,
				severity: "warning",
			});
		}
	}

	if (delistedSymbols.length > 0 && issues.some((issue) => issue.type === "survivorship_bias")) {
		recommendations.push("Include delisted symbols in historical data to avoid survivorship bias.");
	}

	return {
		consistent: issues.filter((issue) => issue.severity === "error").length === 0,
		issues,
		recommendations,
	};
}
