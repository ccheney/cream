/**
 * Base REST Client basic request tests
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { type ApiError, createRestClient, RestClient } from "../src/client";
import {
	createJsonResponse,
	createMockFetch,
	getMockCallOptions,
	getMockCallUrl,
	type MockFetch,
} from "./helpers";

const originalFetch = globalThis.fetch;
let mockFetch: MockFetch;

beforeEach(() => {
	mockFetch = createMockFetch(() => Promise.resolve(createJsonResponse({ success: true })));
	globalThis.fetch = mockFetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("RestClient construction", () => {
	test("creates client with default configuration", () => {
		const client = createRestClient({ baseUrl: "https://api.example.com" });
		expect(client).toBeInstanceOf(RestClient);
	});

	test("includes authorization header with API key", async () => {
		const client = createRestClient({
			baseUrl: "https://api.example.com",
			apiKey: "test-key",
		});

		await client.get("/test");

		expect(mockFetch).toHaveBeenCalled();
		const options = getMockCallOptions(mockFetch);
		expect((options?.headers as Record<string, string> | undefined)?.Authorization).toBe(
			"Bearer test-key",
		);
	});
});

describe("RestClient request behavior", () => {
	test("makes GET request with query parameters", async () => {
		const client = createRestClient({ baseUrl: "https://api.example.com" });
		await client.get("/test", { foo: "bar", num: 42 });

		expect(mockFetch).toHaveBeenCalled();
		const url = getMockCallUrl(mockFetch);
		expect(url).toContain("foo=bar");
		expect(url).toContain("num=42");
	});

	test("makes POST request with body", async () => {
		const client = createRestClient({ baseUrl: "https://api.example.com" });
		await client.post("/test", { data: "value" });

		expect(mockFetch).toHaveBeenCalled();
		const options = getMockCallOptions(mockFetch);
		expect(options?.method).toBe("POST");
		expect(options?.body).toBe(JSON.stringify({ data: "value" }));
	});

	test("filters undefined query parameters", async () => {
		const client = createRestClient({ baseUrl: "https://api.example.com" });
		await client.get("/test", { foo: "bar", missing: undefined });

		expect(mockFetch).toHaveBeenCalled();
		const url = getMockCallUrl(mockFetch);
		expect(url).toContain("foo=bar");
		expect(url).not.toContain("missing");
	});
});

describe("RestClient schema validation", () => {
	test("validates response with Zod schema", async () => {
		const schema = z.object({ success: z.boolean() });
		const client = createRestClient({ baseUrl: "https://api.example.com" });

		const result = await client.get("/test", {}, schema);
		expect(result.success).toBe(true);
	});

	test("throws on schema validation failure", async () => {
		const schema = z.object({ missing_field: z.string() });
		const client = createRestClient({ baseUrl: "https://api.example.com" });
		await expect(client.get("/test", {}, schema)).rejects.toThrow();
	});
});

describe("RestClient retry classification", () => {
	test("does not retry on 4xx errors", async () => {
		let attempts = 0;
		mockFetch = createMockFetch(() => {
			attempts++;
			return Promise.resolve(new Response("Bad Request", { status: 400 }));
		});
		globalThis.fetch = mockFetch;

		const client = createRestClient({
			baseUrl: "https://api.example.com",
			retry: {
				maxRetries: 3,
				initialDelayMs: 10,
				maxDelayMs: 100,
				backoffMultiplier: 2,
			},
		});

		try {
			await client.get("/test");
		} catch (error) {
			const apiError = error as ApiError;
			expect(apiError.status).toBe(400);
			expect(apiError.retryable).toBe(false);
		}

		expect(attempts).toBe(1);
	});
});
