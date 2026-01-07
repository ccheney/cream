/**
 * Arrow Flight Client Tests
 *
 * Unit tests for the FlightServiceClient and ArrowFlightClient.
 */

process.env.CREAM_ENV = "BACKTEST";

import { describe, expect, test } from "bun:test";
import { FlightError } from "./types.js";

// Note: These tests don't require a running Flight server.
// They test client construction and error handling logic.

describe("FlightError", () => {
  test("creates error with message and code", () => {
    const error = new FlightError("Test error", "TEST_CODE", true);

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.retryable).toBe(true);
    expect(error.name).toBe("FlightError");
  });

  test("creates error with non-retryable default", () => {
    const error = new FlightError("Test error", "TEST_CODE");

    expect(error.retryable).toBe(false);
  });

  test("fromGrpcError handles Error instances", () => {
    const sourceError = new Error("Connection unavailable");
    const flightError = FlightError.fromGrpcError(sourceError);

    expect(flightError.message).toBe("Connection unavailable");
    expect(flightError.code).toBe("UNAVAILABLE");
    expect(flightError.retryable).toBe(true);
  });

  test("fromGrpcError handles deadline errors", () => {
    const sourceError = new Error("Deadline exceeded");
    const flightError = FlightError.fromGrpcError(sourceError);

    expect(flightError.code).toBe("UNAVAILABLE");
    expect(flightError.retryable).toBe(true);
  });

  test("fromGrpcError handles unknown errors", () => {
    const sourceError = new Error("Unknown error");
    const flightError = FlightError.fromGrpcError(sourceError);

    expect(flightError.code).toBe("UNKNOWN");
    expect(flightError.retryable).toBe(false);
  });

  test("fromGrpcError handles non-Error values", () => {
    const flightError = FlightError.fromGrpcError("string error");

    expect(flightError.message).toBe("string error");
    expect(flightError.code).toBe("UNKNOWN");
    expect(flightError.retryable).toBe(false);
  });
});

describe("ArrowFlightClient", () => {
  // Import dynamically to avoid module resolution issues in tests
  test("exports ArrowFlightClient and createFlightClient", async () => {
    const { ArrowFlightClient, createFlightClient } = await import("./client.js");

    expect(ArrowFlightClient).toBeDefined();
    expect(createFlightClient).toBeDefined();
  });

  test("createFlightClient returns ArrowFlightClient instance", async () => {
    const { ArrowFlightClient, createFlightClient } = await import("./client.js");

    const client = createFlightClient("grpc://localhost:50052");

    expect(client).toBeInstanceOf(ArrowFlightClient);
  });

  test("client is not connected initially", async () => {
    const { createFlightClient } = await import("./client.js");

    const client = createFlightClient("grpc://localhost:50052");

    expect(client.isConnected()).toBe(false);
  });

  test("throws error when calling methods before connect", async () => {
    const { createFlightClient } = await import("./client.js");

    const client = createFlightClient("grpc://localhost:50052");

    await expect(client.getMarketData()).rejects.toThrow("Not connected to Flight server");
    await expect(client.getCandles("AAPL", "1h")).rejects.toThrow("Not connected to Flight server");
    await expect(client.getTicks("AAPL")).rejects.toThrow("Not connected to Flight server");
    await expect(client.getOptionChain("AAPL", "2026-01-15")).rejects.toThrow(
      "Not connected to Flight server"
    );
    await expect(client.getPortfolioHistory()).rejects.toThrow("Not connected to Flight server");
    await expect(client.listFlights()).rejects.toThrow("Not connected to Flight server");
    await expect(client.doAction("health_check")).rejects.toThrow("Not connected to Flight server");
  });

  test("disconnect sets connected to false", async () => {
    const { createFlightClient } = await import("./client.js");

    const client = createFlightClient("grpc://localhost:50052");

    // Mock connect to avoid actual gRPC connection
    // @ts-expect-error - accessing private property for testing
    client.connected = true;

    expect(client.isConnected()).toBe(true);

    await client.disconnect();

    expect(client.isConnected()).toBe(false);
  });
});

describe("FlightServiceClient", () => {
  test("exports FlightServiceClient and createFlightServiceClient", async () => {
    const { FlightServiceClient, createFlightServiceClient } = await import("./flight-client.js");

    expect(FlightServiceClient).toBeDefined();
    expect(createFlightServiceClient).toBeDefined();
  });

  test("createFlightServiceClient returns FlightServiceClient instance", async () => {
    const { FlightServiceClient, createFlightServiceClient } = await import("./flight-client.js");

    const client = createFlightServiceClient("http://localhost:50052");

    expect(client).toBeInstanceOf(FlightServiceClient);
  });
});

describe("Arrow module exports", () => {
  test("exports all expected types and functions", async () => {
    const arrowModule = await import("./index.js");

    // High-level client
    expect(arrowModule.ArrowFlightClient).toBeDefined();
    expect(arrowModule.createFlightClient).toBeDefined();

    // Low-level client
    expect(arrowModule.FlightServiceClient).toBeDefined();
    expect(arrowModule.createFlightServiceClient).toBeDefined();

    // Types
    expect(arrowModule.FlightError).toBeDefined();
    expect(arrowModule.FlightPaths).toBeDefined();
    expect(arrowModule.DEFAULT_FLIGHT_CONFIG).toBeDefined();
  });

  test("FlightPaths generates correct paths", async () => {
    const { FlightPaths } = await import("./types.js");

    expect(FlightPaths.candles("AAPL", "1h")).toEqual(["candles", "AAPL", "1h"]);
    expect(FlightPaths.ticks("GOOGL")).toEqual(["ticks", "GOOGL"]);
    expect(FlightPaths.chains("SPY", "2026-01-15")).toEqual(["chains", "SPY", "2026-01-15"]);
    expect(FlightPaths.portfolioHistory()).toEqual(["portfolio", "history"]);
  });
});
