/**
 * Test Helpers for Marketdata Package
 */

import { mock } from "bun:test";

type FetchParameters = Parameters<typeof fetch>;
type FetchReturnType = ReturnType<typeof fetch>;

/**
 * Mock fetch type that includes both fetch signature and mock methods.
 * The calls array is typed to match the fetch signature.
 */
export interface MockFetch {
	(...args: FetchParameters): FetchReturnType;
	preconnect: typeof fetch.preconnect;
	mock: {
		calls: [url: string | URL | Request, options?: RequestInit | undefined][];
		results: { type: "return" | "throw"; value: unknown }[];
		contexts: unknown[];
		lastCall: [url: string | URL | Request, options?: RequestInit | undefined] | undefined;
	};
}

/**
 * Create a mock fetch function that has the required `preconnect` property.
 * Bun's fetch has a preconnect method that must be present on the mock.
 */
export function createMockFetch(implementation: () => Promise<Response>): MockFetch {
	const mockFn = mock(implementation);
	// Add preconnect stub to satisfy Bun's fetch type
	const typedMock = mockFn as unknown as MockFetch;
	typedMock.preconnect = () => {};
	return typedMock;
}

/**
 * Create a mock JSON response.
 */
export function createJsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Get the URL from a mock fetch call.
 * Throws if the call doesn't exist or URL is missing.
 */
export function getMockCallUrl(mockFetch: MockFetch, callIndex = 0): string {
	const call = mockFetch.mock.calls[callIndex];
	if (!call) {
		throw new Error(`Expected mock fetch to have call at index ${callIndex}`);
	}
	const [url] = call;
	return String(url);
}

/**
 * Get the options from a mock fetch call.
 * Throws if the call doesn't exist.
 */
export function getMockCallOptions(mockFetch: MockFetch, callIndex = 0): RequestInit | undefined {
	const call = mockFetch.mock.calls[callIndex];
	if (!call) {
		throw new Error(`Expected mock fetch to have call at index ${callIndex}`);
	}
	return call[1];
}
