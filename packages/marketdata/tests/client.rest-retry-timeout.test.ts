/**
 * Base REST Client retry/timeout tests
 */

import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { type ApiError, createRestClient } from "../src/client";
import { createJsonResponse, createMockFetch, type MockFetch } from "./helpers";

const originalFetch = globalThis.fetch;
let mockFetch: MockFetch;

beforeEach(() => {
	mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse({ success: true })));
	globalThis.fetch = mockFetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function createRetryingClient(timeoutMs?: number) {
	return createRestClient({
		baseUrl: "https://api.example.com",
		timeoutMs,
		retry: {
			maxRetries: 3,
			initialDelayMs: 10,
			maxDelayMs: 100,
			backoffMultiplier: 2,
		},
	});
}

test("RestClient retries on server error", async () => {
	let attempts = 0;
	mockFetch = createMockFetch(() => {
		attempts++;
		if (attempts < 3) {
			return Promise.resolve(new Response("Server Error", { status: 500 }));
		}
		return Promise.resolve(createJsonResponse({ success: true }));
	});
	globalThis.fetch = mockFetch;
	const client = createRetryingClient();
	const result = await client.get<{ success: boolean }>("/test");
	expect(result.success).toBe(true);
	expect(attempts).toBe(3);
});

test("RestClient retries on rate limit", async () => {
	let attempts = 0;
	mockFetch = createMockFetch(() => {
		attempts++;
		if (attempts < 2) {
			return Promise.resolve(new Response("Rate Limited", { status: 429 }));
		}
		return Promise.resolve(createJsonResponse({ success: true }));
	});
	globalThis.fetch = mockFetch;
	const client = createRetryingClient();
	const result = await client.get<{ success: boolean }>("/test");
	expect(result.success).toBe(true);
	expect(attempts).toBe(2);
});

test("RestClient handles timeout", async () => {
	const timeoutMockFn = mock((_url: string, options?: RequestInit) => {
		return new Promise<Response>((resolve, reject) => {
			const timeoutId = setTimeout(() => resolve(createJsonResponse({ success: true })), 1000);
			options?.signal?.addEventListener("abort", () => {
				clearTimeout(timeoutId);
				const error = new Error("The operation was aborted");
				error.name = "AbortError";
				reject(error);
			});
		});
	});
	const typedMock = timeoutMockFn as unknown as typeof fetch;
	(typedMock as typeof fetch & { preconnect: () => void }).preconnect = () => {};
	globalThis.fetch = typedMock;
	const client = createRetryingClient(50);

	try {
		await client.get("/test");
		expect(true).toBe(false);
	} catch (error) {
		const apiError = error as ApiError;
		expect(apiError.message).toContain("Request timed out");
		expect(apiError.retryable).toBe(true);
	}
});
