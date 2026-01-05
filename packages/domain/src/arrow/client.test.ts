/**
 * Tests for Arrow Flight Client
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { ArrowFlightClient, createFlightClient } from "./client.js";
import { FlightError, FlightPaths } from "./types.js";

describe("ArrowFlightClient", () => {
  let client: ArrowFlightClient;

  beforeEach(() => {
    client = new ArrowFlightClient({ endpoint: "grpc://localhost:50052" });
  });

  describe("connection", () => {
    it("should not be connected initially", () => {
      expect(client.isConnected()).toBe(false);
    });

    it("should connect successfully", async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });

    it("should disconnect successfully", async () => {
      await client.connect();
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("getCandles", () => {
    it("should throw if not connected", async () => {
      await expect(client.getCandles("AAPL", "1h")).rejects.toThrow(FlightError);
    });

    it("should return empty result when connected (stubbed)", async () => {
      await client.connect();

      const result = await client.getCandles("AAPL", "1h", {
        from: new Date("2026-01-01"),
        to: new Date("2026-01-05"),
      });

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getTicks", () => {
    it("should throw if not connected", async () => {
      await expect(client.getTicks("AAPL")).rejects.toThrow(FlightError);
    });

    it("should return empty result when connected (stubbed)", async () => {
      await client.connect();

      const result = await client.getTicks("AAPL");

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe("getOptionChain", () => {
    it("should throw if not connected", async () => {
      await expect(
        client.getOptionChain("AAPL", "2026-01-17")
      ).rejects.toThrow(FlightError);
    });

    it("should return empty result when connected (stubbed)", async () => {
      await client.connect();

      const result = await client.getOptionChain("AAPL", "2026-01-17", {
        minStrike: 150,
        maxStrike: 200,
      });

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe("getPortfolioHistory", () => {
    it("should throw if not connected", async () => {
      await expect(client.getPortfolioHistory()).rejects.toThrow(FlightError);
    });

    it("should return empty result when connected (stubbed)", async () => {
      await client.connect();

      const result = await client.getPortfolioHistory({
        resolution: "day",
      });

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe("listFlights", () => {
    it("should throw if not connected", async () => {
      await expect(client.listFlights()).rejects.toThrow(FlightError);
    });

    it("should return available paths when connected", async () => {
      await client.connect();

      const flights = await client.listFlights();

      expect(flights).toHaveLength(4);
      expect(flights[0]).toContain("candles");
      expect(flights[1]).toContain("ticks");
      expect(flights[2]).toContain("chains");
      expect(flights[3]).toContain("portfolio");
    });
  });
});

describe("createFlightClient", () => {
  it("should create a client with the given endpoint", () => {
    const client = createFlightClient("grpc://localhost:50052");
    expect(client).toBeInstanceOf(ArrowFlightClient);
    expect(client.isConnected()).toBe(false);
  });
});

describe("FlightPaths", () => {
  it("should generate candles path", () => {
    const path = FlightPaths.candles("AAPL", "1h");
    expect(path).toEqual(["candles", "AAPL", "1h"]);
  });

  it("should generate ticks path", () => {
    const path = FlightPaths.ticks("MSFT");
    expect(path).toEqual(["ticks", "MSFT"]);
  });

  it("should generate chains path", () => {
    const path = FlightPaths.chains("GOOGL", "2026-01-17");
    expect(path).toEqual(["chains", "GOOGL", "2026-01-17"]);
  });

  it("should generate portfolio history path", () => {
    const path = FlightPaths.portfolioHistory();
    expect(path).toEqual(["portfolio", "history"]);
  });
});

describe("FlightError", () => {
  it("should create error with code", () => {
    const error = new FlightError("Test error", "TEST_CODE", true);

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.retryable).toBe(true);
    expect(error.name).toBe("FlightError");
  });

  it("should default retryable to false", () => {
    const error = new FlightError("Test error", "TEST_CODE");
    expect(error.retryable).toBe(false);
  });

  describe("fromGrpcError", () => {
    it("should detect unavailable errors as retryable", () => {
      const grpcError = new Error("Service unavailable");
      const error = FlightError.fromGrpcError(grpcError);

      expect(error.code).toBe("UNAVAILABLE");
      expect(error.retryable).toBe(true);
    });

    it("should detect deadline errors as retryable", () => {
      const grpcError = new Error("Deadline exceeded");
      const error = FlightError.fromGrpcError(grpcError);

      expect(error.code).toBe("UNAVAILABLE");
      expect(error.retryable).toBe(true);
    });

    it("should handle non-Error input", () => {
      const error = FlightError.fromGrpcError("string error");

      expect(error.code).toBe("UNKNOWN");
      expect(error.message).toBe("string error");
      expect(error.retryable).toBe(false);
    });
  });
});
