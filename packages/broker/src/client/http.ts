/**
 * Alpaca HTTP Client
 *
 * Low-level HTTP client for Alpaca API with authentication and error handling.
 */

import { log } from "../logger.js";
import type { TradingEnvironment } from "../types.js";
import { BrokerError } from "../types.js";
import { mapHttpStatusToErrorCode } from "./mappers.js";

const ENDPOINTS = {
	PAPER: "https://paper-api.alpaca.markets",
	LIVE: "https://api.alpaca.markets",
	DATA: "https://data.alpaca.markets",
} as const;

export interface HttpClientConfig {
	apiKey: string;
	apiSecret: string;
	environment: TradingEnvironment;
}

export type RequestFn = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export function getBaseUrl(environment: TradingEnvironment): string {
	return environment === "LIVE" ? ENDPOINTS.LIVE : ENDPOINTS.PAPER;
}

function createHeaders(apiKey: string, apiSecret: string): Record<string, string> {
	return {
		"APCA-API-KEY-ID": apiKey,
		"APCA-API-SECRET-KEY": apiSecret,
		"Content-Type": "application/json",
	};
}

type RequestContext = {
	method: string;
	path: string;
	environment: TradingEnvironment;
	startTime: number;
};

function getLatencyMs(startTime: number): number {
	return Date.now() - startTime;
}

function extractErrorMessage(errorBody: string, status: number): string {
	const fallbackMessage = `Alpaca API error: ${status}`;
	try {
		const errorJson = JSON.parse(errorBody) as { message?: string };
		return errorJson.message || fallbackMessage;
	} catch {
		return errorBody || fallbackMessage;
	}
}

async function assertOkResponse(response: Response, context: RequestContext): Promise<void> {
	if (response.ok) {
		return;
	}
	const errorBody = await response.text();
	const errorMessage = extractErrorMessage(errorBody, response.status);
	const errorCode = mapHttpStatusToErrorCode(response.status, errorMessage);
	log.error(
		{
			method: context.method,
			path: context.path,
			status: response.status,
			errorCode,
			latencyMs: getLatencyMs(context.startTime),
		},
		"Alpaca API error",
	);
	throw new BrokerError(errorMessage, errorCode);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
	const text = await response.text();
	return text ? (JSON.parse(text) as T) : (undefined as T);
}

function createNetworkError(error: unknown): BrokerError {
	const cause = error instanceof Error ? error : undefined;
	const message = cause?.message ?? "Unknown error";
	return new BrokerError(`Network error: ${message}`, "NETWORK_ERROR", undefined, undefined, cause);
}

function logNetworkError(error: unknown, context: RequestContext): void {
	log.error(
		{
			method: context.method,
			path: context.path,
			error: error instanceof Error ? error.message : "Unknown",
			latencyMs: getLatencyMs(context.startTime),
		},
		"Alpaca API network error",
	);
}

async function performRequest<T>(
	url: string,
	headers: Record<string, string>,
	body: unknown,
	context: RequestContext,
): Promise<T> {
	const response = await fetch(url, {
		method: context.method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
	await assertOkResponse(response, context);
	log.debug(
		{
			method: context.method,
			path: context.path,
			status: response.status,
			latencyMs: getLatencyMs(context.startTime),
		},
		"Alpaca API response",
	);
	return parseJsonResponse<T>(response);
}

export function createRequestFn(config: HttpClientConfig): RequestFn {
	const headers = createHeaders(config.apiKey, config.apiSecret);
	const baseUrl = getBaseUrl(config.environment);
	return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
		const context: RequestContext = {
			method,
			path,
			environment: config.environment,
			startTime: Date.now(),
		};
		log.debug({ method, path, environment: context.environment }, "Alpaca API request");
		try {
			return await performRequest<T>(`${baseUrl}${path}`, headers, body, context);
		} catch (error) {
			if (error instanceof BrokerError) {
				throw error;
			}
			logNetworkError(error, context);
			throw createNetworkError(error);
		}
	};
}
