/**
 * AlpacaCalendarClient Tests
 *
 * Tests for the Alpaca Calendar and Clock API client.
 * Uses mocked fetch responses.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	AlpacaCalendarClient,
	CalendarClientError,
	createAlpacaCalendarClient,
} from "./alpaca-client";

describe("AlpacaCalendarClient", () => {
	const config = {
		apiKey: "test-key",
		apiSecret: "test-secret",
		environment: "PAPER" as const,
		// Fast retries for tests (1ms instead of 1000ms)
		initialBackoffMs: 1,
	};

	let client: AlpacaCalendarClient;
	let fetchSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		client = new AlpacaCalendarClient(config);
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	describe("getCalendar", () => {
		it("returns calendar days for a date range", async () => {
			const mockResponse = [
				{ date: "2026-01-05", open: "09:30", close: "16:00" },
				{ date: "2026-01-06", open: "09:30", close: "16:00" },
			];

			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.getCalendar("2026-01-05", "2026-01-06");

			expect(result).toHaveLength(2);
			expect(result[0]?.date).toBe("2026-01-05");
			expect(result[0]?.open).toBe("09:30");
			expect(result[0]?.close).toBe("16:00");
		});

		it("includes session times when provided", async () => {
			const mockResponse = [
				{
					date: "2026-01-05",
					open: "09:30",
					close: "16:00",
					session_open: "04:00",
					session_close: "20:00",
				},
			];

			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.getCalendar("2026-01-05", "2026-01-05");

			expect(result[0]?.sessionOpen).toBe("04:00");
			expect(result[0]?.sessionClose).toBe("20:00");
		});

		it("uses correct URL with query params", async () => {
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

			await client.getCalendar("2026-01-01", "2026-01-31");

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://paper-api.alpaca.markets/v2/calendar?start=2026-01-01&end=2026-01-31",
				expect.objectContaining({
					method: "GET",
					headers: expect.objectContaining({
						"APCA-API-KEY-ID": "test-key",
						"APCA-API-SECRET-KEY": "test-secret",
					}),
				})
			);
		});

		it("handles Date objects", async () => {
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

			const start = new Date("2026-01-05T12:00:00Z");
			const end = new Date("2026-01-06T12:00:00Z");
			await client.getCalendar(start, end);

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://paper-api.alpaca.markets/v2/calendar?start=2026-01-05&end=2026-01-06",
				expect.any(Object)
			);
		});

		it("throws CalendarClientError on invalid response", async () => {
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify([{ invalid: "data" }]), { status: 200 })
			);

			await expect(client.getCalendar("2026-01-01", "2026-01-31")).rejects.toThrow(
				CalendarClientError
			);
		});

		it("throws CalendarClientError on 401", async () => {
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
			);

			try {
				await client.getCalendar("2026-01-01", "2026-01-31");
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CalendarClientError);
				expect((error as CalendarClientError).code).toBe("INVALID_CREDENTIALS");
			}
		});
	});

	describe("getClock", () => {
		it("returns market clock status", async () => {
			const mockResponse = {
				timestamp: "2026-01-12T15:30:00.000Z",
				is_open: true,
				next_open: "2026-01-13T14:30:00.000Z",
				next_close: "2026-01-12T21:00:00.000Z",
			};

			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.getClock();

			expect(result.isOpen).toBe(true);
			expect(result.timestamp).toBeInstanceOf(Date);
			expect(result.nextOpen).toBeInstanceOf(Date);
			expect(result.nextClose).toBeInstanceOf(Date);
		});

		it("uses correct URL", async () => {
			const mockResponse = {
				timestamp: "2026-01-12T15:30:00.000Z",
				is_open: true,
				next_open: "2026-01-13T14:30:00.000Z",
				next_close: "2026-01-12T21:00:00.000Z",
			};

			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

			await client.getClock();

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://paper-api.alpaca.markets/v2/clock",
				expect.any(Object)
			);
		});

		it("throws CalendarClientError on invalid response", async () => {
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ invalid: "data" }), { status: 200 })
			);

			await expect(client.getClock()).rejects.toThrow(CalendarClientError);
		});
	});

	describe("error handling", () => {
		it("handles rate limiting with retry", async () => {
			const mockResponse = {
				timestamp: "2026-01-12T15:30:00.000Z",
				is_open: true,
				next_open: "2026-01-13T14:30:00.000Z",
				next_close: "2026-01-12T21:00:00.000Z",
			};

			// First call returns 429, second succeeds
			fetchSpy
				.mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
				.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.getClock();
			expect(result.isOpen).toBe(true);
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		});

		it("throws after max retries on rate limiting", async () => {
			fetchSpy.mockResolvedValue(new Response("Rate limited", { status: 429 }));

			try {
				await client.getClock();
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CalendarClientError);
				expect((error as CalendarClientError).code).toBe("RATE_LIMITED");
			}
		});

		it("handles network errors with retry", async () => {
			const mockResponse = {
				timestamp: "2026-01-12T15:30:00.000Z",
				is_open: true,
				next_open: "2026-01-13T14:30:00.000Z",
				next_close: "2026-01-12T21:00:00.000Z",
			};

			// First call throws, second succeeds
			fetchSpy
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.getClock();
			expect(result.isOpen).toBe(true);
		});

		it("throws NETWORK_ERROR after max retries", async () => {
			fetchSpy.mockRejectedValue(new Error("Connection refused"));

			try {
				await client.getClock();
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CalendarClientError);
				expect((error as CalendarClientError).code).toBe("NETWORK_ERROR");
			}
		});
	});

	describe("environment", () => {
		it("uses PAPER endpoint by default", async () => {
			const paperClient = new AlpacaCalendarClient({
				...config,
				environment: "PAPER",
			});

			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

			await paperClient.getCalendar("2026-01-01", "2026-01-01");

			expect(fetchSpy).toHaveBeenCalledWith(
				expect.stringContaining("paper-api.alpaca.markets"),
				expect.any(Object)
			);
		});

		it("uses LIVE endpoint when configured", async () => {
			const liveClient = new AlpacaCalendarClient({
				...config,
				environment: "LIVE",
			});

			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

			await liveClient.getCalendar("2026-01-01", "2026-01-01");

			expect(fetchSpy).toHaveBeenCalledWith(
				expect.stringContaining("api.alpaca.markets"),
				expect.any(Object)
			);
		});
	});

	describe("factory function", () => {
		it("creates a valid client", () => {
			const factoryClient = createAlpacaCalendarClient(config);
			expect(factoryClient).toBeInstanceOf(AlpacaCalendarClient);
		});
	});
});
