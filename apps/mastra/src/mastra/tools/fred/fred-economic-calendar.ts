/**
 * FRED Economic Calendar Tool
 *
 * Fetch upcoming economic events from FRED (Federal Reserve Economic Data).
 */

import { getFredEconomicCalendar as getEconomicCalendarImpl } from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

const FREDCalendarInputSchema = z.object({
	startDate: z
		.string()
		.optional()
		.describe("Start date in YYYY-MM-DD format (defaults to today in America/New_York if omitted)"),
	endDate: z
		.string()
		.optional()
		.describe("End date in YYYY-MM-DD format (defaults to +3 days if omitted)"),
});

const FREDEventSchema = z.object({
	id: z.string(),
	name: z.string(),
	date: z.string(),
	time: z.string(),
	impact: z.enum(["high", "medium", "low"]),
	forecast: z.string().nullable(),
	previous: z.string().nullable(),
	actual: z.string().nullable(),
});

const FREDCalendarOutputSchema = z.object({
	startDate: z.string(),
	endDate: z.string(),
	events: z.array(FREDEventSchema),
});

export const fredEconomicCalendar = createTool({
	id: "fredEconomicCalendar",
	description: `Get economic calendar events from FRED (Federal Reserve Economic Data).

Use this tool to find upcoming Federal Reserve data releases including:
- CPI (Consumer Price Index) - HIGH impact, inflation data
- Employment Situation (NFP, unemployment) - HIGH impact
- GDP releases - HIGH impact
- FOMC rate decisions - HIGH impact
- Retail Sales - HIGH impact
- PPI, Industrial Production, Housing Starts - MEDIUM impact

Events are filtered to tracked releases only (no minor data).`,
	inputSchema: FREDCalendarInputSchema,
	outputSchema: FREDCalendarOutputSchema,
	execute: async (inputData) => {
		const ctx = createToolContext();

		const nyFormatter = new Intl.DateTimeFormat("en-US", {
			timeZone: "America/New_York",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});

		const formatDate = (date: Date) => {
			const parts = nyFormatter.formatToParts(date);
			const year = parts.find((p) => p.type === "year")?.value;
			const month = parts.find((p) => p.type === "month")?.value;
			const day = parts.find((p) => p.type === "day")?.value;
			return `${year}-${month}-${day}`;
		};

		const today = new Date();
		const defaultStart = formatDate(today);
		const defaultEnd = formatDate(new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000));

		const startDate = inputData.startDate ?? defaultStart;
		const endDate = inputData.endDate ?? defaultEnd;

		const events = await getEconomicCalendarImpl(ctx, startDate, endDate);
		return { startDate, endDate, events };
	},
});

export { FREDCalendarInputSchema, FREDCalendarOutputSchema };
