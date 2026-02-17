import { z } from "zod";

import type { ParseLogger } from "../llm-parsing";

export const SimpleSchema = z.object({
	name: z.string(),
	value: z.number(),
});

export const ComplexSchema = z.object({
	action: z.enum(["BUY", "SELL", "HOLD"]),
	symbol: z.string().min(1),
	quantity: z.number().int().positive(),
	confidence: z.number().min(0).max(1),
	rationale: z.string().min(10),
	nested: z
		.object({
			level: z.number(),
			tags: z.array(z.string()),
		})
		.optional(),
});

type MockLoggerCalls = {
	debug: unknown[][];
	info: unknown[][];
	warn: unknown[][];
	error: unknown[][];
};

export function createMockLogger(): ParseLogger & { calls: MockLoggerCalls } {
	const calls: MockLoggerCalls = {
		debug: [],
		info: [],
		warn: [],
		error: [],
	};

	return {
		calls,
		debug: (message, data) => calls.debug.push([message, data]),
		info: (message, data) => calls.info.push([message, data]),
		warn: (message, data) => calls.warn.push([message, data]),
		error: (message, data) => calls.error.push([message, data]),
	};
}
