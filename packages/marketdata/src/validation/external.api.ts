import { z } from "zod";

import type { RateLimitStatus } from "./external.types";

export const ApiErrorResponseSchema = z.object({
	error: z.string().optional(),
	message: z.string().optional(),
	status: z.union([z.string(), z.number()]).optional(),
	code: z.union([z.string(), z.number()]).optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export function isApiErrorResponse(response: unknown): response is ApiErrorResponse {
	if (typeof response !== "object" || response === null) {
		return false;
	}
	const obj = response as Record<string, unknown>;
	if (obj.error || obj.Error || obj.ERROR) {
		return true;
	}
	if (typeof obj.status === "string" && obj.status.toLowerCase().includes("error")) {
		return true;
	}
	if (typeof obj.status === "number" && obj.status >= 400) {
		return true;
	}
	return typeof obj.code === "number" && obj.code !== 200 && obj.code !== 0;
}

export function extractApiErrorMessage(response: unknown): string {
	if (typeof response !== "object" || response === null) {
		return "Unknown error";
	}
	const obj = response as Record<string, unknown>;
	if (typeof obj.error === "string") {
		return obj.error;
	}
	if (typeof obj.message === "string") {
		return obj.message;
	}
	if (typeof obj.Error === "string") {
		return obj.Error;
	}
	if (typeof obj.Message === "string") {
		return obj.Message;
	}
	if (typeof obj.error_message === "string") {
		return obj.error_message;
	}
	if (typeof obj.error === "object" && obj.error !== null) {
		const nested = obj.error as Record<string, unknown>;
		if (typeof nested.message === "string") {
			return nested.message;
		}
	}
	return JSON.stringify(response);
}

type HeaderMap = Headers | Record<string, string>;

type HeaderGetter = (name: string) => string | null;

function createHeaderGetter(headers: HeaderMap): HeaderGetter {
	return (name: string) => {
		if (headers instanceof Headers) {
			return headers.get(name);
		}
		return headers[name] ?? headers[name.toLowerCase()] ?? null;
	};
}

function parseOptionalInt(value: string | null): number | undefined {
	if (!value) {
		return undefined;
	}
	const num = Number.parseInt(value, 10);
	return Number.isNaN(num) ? undefined : num;
}

function parseResetTime(rawReset: string | null): Date | undefined {
	const resetNum = parseOptionalInt(rawReset);
	if (resetNum === undefined) {
		return undefined;
	}
	return resetNum > 1e9 ? new Date(resetNum * 1000) : new Date(Date.now() + resetNum * 1000);
}

function parseRetryAfter(rawRetryAfter: string | null): number | undefined {
	const retrySeconds = parseOptionalInt(rawRetryAfter);
	if (retrySeconds !== undefined) {
		return retrySeconds;
	}
	if (!rawRetryAfter) {
		return undefined;
	}
	const retryDate = new Date(rawRetryAfter);
	if (Number.isNaN(retryDate.getTime())) {
		return undefined;
	}
	return Math.max(0, Math.ceil((retryDate.getTime() - Date.now()) / 1000));
}

export function extractRateLimitStatus(headers: HeaderMap): RateLimitStatus {
	const getHeader = createHeaderGetter(headers);
	const remaining = parseOptionalInt(
		getHeader("X-RateLimit-Remaining") ?? getHeader("RateLimit-Remaining"),
	);
	const limit = parseOptionalInt(getHeader("X-RateLimit-Limit") ?? getHeader("RateLimit-Limit"));
	const resetTime = parseResetTime(getHeader("X-RateLimit-Reset") ?? getHeader("RateLimit-Reset"));
	const retryAfterSeconds = parseRetryAfter(getHeader("Retry-After"));

	return {
		isRateLimited: remaining === 0 || retryAfterSeconds !== undefined,
		remaining,
		limit,
		resetTime,
		retryAfterSeconds,
	};
}
