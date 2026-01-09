/**
 * gRPC Client Tests
 *
 * Tests for ExecutionServiceClient and MarketDataServiceClient.
 */

import { describe, expect, test } from "bun:test";
import {
  createExecutionClient,
  createMarketDataClient,
  DEFAULT_GRPC_CONFIG,
  ExecutionServiceClient,
  GrpcError,
  GrpcErrorCode,
  isRetryableErrorCode,
  MarketDataServiceClient,
  RetryBackoff,
} from "../index.js";

describe("gRPC Client Tests", () => {
  describe("GrpcError", () => {
    test("creates error with code and message", () => {
      const error = new GrpcError("Connection refused", "UNAVAILABLE");
      expect(error.message).toBe("Connection refused");
      expect(error.code).toBe("UNAVAILABLE");
      expect(error.retryable).toBe(true);
      expect(error.name).toBe("GrpcError");
    });

    test("marks retryable errors correctly", () => {
      const unavailable = new GrpcError("unavailable", "UNAVAILABLE");
      expect(unavailable.retryable).toBe(true);

      const resourceExhausted = new GrpcError("rate limited", "RESOURCE_EXHAUSTED");
      expect(resourceExhausted.retryable).toBe(true);

      const deadlineExceeded = new GrpcError("timeout", "DEADLINE_EXCEEDED");
      expect(deadlineExceeded.retryable).toBe(true);

      const invalidArgument = new GrpcError("bad request", "INVALID_ARGUMENT");
      expect(invalidArgument.retryable).toBe(false);

      const notFound = new GrpcError("not found", "NOT_FOUND");
      expect(notFound.retryable).toBe(false);
    });

    test("fromConnectError handles connect errors", () => {
      const connectError = {
        code: "unavailable",
        message: "Server unavailable",
        rawMessage: "Connection refused",
      };

      const error = GrpcError.fromConnectError(connectError, "req-123");
      expect(error.code).toBe("UNAVAILABLE");
      expect(error.message).toBe("Connection refused");
      expect(error.requestId).toBe("req-123");
      expect(error.retryable).toBe(true);
    });

    test("fromConnectError handles generic errors", () => {
      const genericError = new Error("Something went wrong");

      const error = GrpcError.fromConnectError(genericError, "req-456");
      expect(error.code).toBe("UNKNOWN");
      expect(error.message).toBe("Something went wrong");
      expect(error.requestId).toBe("req-456");
    });

    test("fromConnectError handles unknown values", () => {
      const error = GrpcError.fromConnectError("string error", "req-789");
      expect(error.code).toBe("UNKNOWN");
      expect(error.message).toBe("string error");
    });

    test("helper methods work correctly", () => {
      const unavailable = new GrpcError("unavailable", "UNAVAILABLE");
      expect(unavailable.isUnavailable()).toBe(true);
      expect(unavailable.isRateLimited()).toBe(false);
      expect(unavailable.isTimeout()).toBe(false);
      expect(unavailable.isInvalidInput()).toBe(false);

      const rateLimited = new GrpcError("rate limited", "RESOURCE_EXHAUSTED");
      expect(rateLimited.isRateLimited()).toBe(true);

      const timeout = new GrpcError("timeout", "DEADLINE_EXCEEDED");
      expect(timeout.isTimeout()).toBe(true);

      const invalidInput = new GrpcError("invalid", "INVALID_ARGUMENT");
      expect(invalidInput.isInvalidInput()).toBe(true);
    });

    test("toJSON serializes error", () => {
      const error = new GrpcError("test error", "INTERNAL", {
        requestId: "req-json",
        details: { extra: "info" },
      });

      const json = error.toJSON();
      expect(json.name).toBe("GrpcError");
      expect(json.message).toBe("test error");
      expect(json.code).toBe("INTERNAL");
      expect(json.retryable).toBe(false);
      expect(json.requestId).toBe("req-json");
      expect(json.details).toEqual({ extra: "info" });
    });
  });

  describe("isRetryableErrorCode", () => {
    test("identifies retryable codes", () => {
      expect(isRetryableErrorCode("UNAVAILABLE")).toBe(true);
      expect(isRetryableErrorCode("RESOURCE_EXHAUSTED")).toBe(true);
      expect(isRetryableErrorCode("DEADLINE_EXCEEDED")).toBe(true);
      expect(isRetryableErrorCode("ABORTED")).toBe(true);
    });

    test("identifies non-retryable codes", () => {
      expect(isRetryableErrorCode("INVALID_ARGUMENT")).toBe(false);
      expect(isRetryableErrorCode("NOT_FOUND")).toBe(false);
      expect(isRetryableErrorCode("PERMISSION_DENIED")).toBe(false);
      expect(isRetryableErrorCode("INTERNAL")).toBe(false);
      expect(isRetryableErrorCode("UNAUTHENTICATED")).toBe(false);
      expect(isRetryableErrorCode("UNIMPLEMENTED")).toBe(false);
    });
  });

  describe("RetryBackoff", () => {
    test("calculates exponential delays", () => {
      const backoff = new RetryBackoff({ baseDelayMs: 100, jitterFactor: 0 });

      const delay1 = backoff.nextDelay();
      expect(delay1).toBe(100);
      expect(backoff.getAttempt()).toBe(1);

      const delay2 = backoff.nextDelay();
      expect(delay2).toBe(200);
      expect(backoff.getAttempt()).toBe(2);

      const delay3 = backoff.nextDelay();
      expect(delay3).toBe(400);
      expect(backoff.getAttempt()).toBe(3);
    });

    test("caps at max delay", () => {
      const backoff = new RetryBackoff({
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        jitterFactor: 0,
      });

      backoff.nextDelay();
      backoff.nextDelay();
      backoff.nextDelay();
      const delay4 = backoff.nextDelay();
      expect(delay4).toBe(5000);

      const delay5 = backoff.nextDelay();
      expect(delay5).toBe(5000);
    });

    test("resets state", () => {
      const backoff = new RetryBackoff({ baseDelayMs: 100, jitterFactor: 0 });

      backoff.nextDelay();
      backoff.nextDelay();
      expect(backoff.getAttempt()).toBe(2);

      backoff.reset();
      expect(backoff.getAttempt()).toBe(0);

      const delay = backoff.nextDelay();
      expect(delay).toBe(100);
    });

    test("applies jitter when factor > 0", () => {
      const delays: number[] = [];
      for (let i = 0; i < 10; i++) {
        const backoffInstance = new RetryBackoff({
          baseDelayMs: 1000,
          jitterFactor: 0.5,
        });
        delays.push(backoffInstance.nextDelay());
      }

      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(500);
        expect(delay).toBeLessThanOrEqual(1500);
      }
    });
  });

  describe("DEFAULT_GRPC_CONFIG", () => {
    test("has expected defaults", () => {
      expect(DEFAULT_GRPC_CONFIG.timeoutMs).toBe(30000);
      expect(DEFAULT_GRPC_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_GRPC_CONFIG.enableLogging).toBe(false);
      expect(DEFAULT_GRPC_CONFIG.headers).toEqual({});
    });
  });

  describe("ExecutionServiceClient", () => {
    test("creates client with config", () => {
      const client = new ExecutionServiceClient({
        baseUrl: "http://localhost:50051",
      });
      expect(client).toBeInstanceOf(ExecutionServiceClient);
    });

    test("creates client with factory function", () => {
      const client = createExecutionClient("http://localhost:50051", {
        maxRetries: 5,
        enableLogging: true,
      });
      expect(client).toBeInstanceOf(ExecutionServiceClient);
    });

    test("has all required methods", () => {
      const client = createExecutionClient("http://localhost:50051");

      expect(typeof client.checkConstraints).toBe("function");
      expect(typeof client.submitOrder).toBe("function");
      expect(typeof client.getOrderState).toBe("function");
      expect(typeof client.cancelOrder).toBe("function");
      expect(typeof client.getAccountState).toBe("function");
      expect(typeof client.getPositions).toBe("function");
      expect(typeof client.streamExecutions).toBe("function");
    });
  });

  describe("MarketDataServiceClient", () => {
    test("creates client with config", () => {
      const client = new MarketDataServiceClient({
        baseUrl: "http://localhost:50052",
      });
      expect(client).toBeInstanceOf(MarketDataServiceClient);
    });

    test("creates client with factory function", () => {
      const client = createMarketDataClient("http://localhost:50052", {
        maxRetries: 5,
        enableLogging: true,
      });
      expect(client).toBeInstanceOf(MarketDataServiceClient);
    });

    test("has all required methods", () => {
      const client = createMarketDataClient("http://localhost:50052");

      expect(typeof client.getSnapshot).toBe("function");
      expect(typeof client.getOptionChain).toBe("function");
      expect(typeof client.subscribeMarketData).toBe("function");
    });
  });

  describe("GrpcErrorCode", () => {
    test("exports all standard gRPC error codes", () => {
      expect(GrpcErrorCode.CANCELLED).toBe("CANCELLED");
      expect(GrpcErrorCode.UNKNOWN).toBe("UNKNOWN");
      expect(GrpcErrorCode.INVALID_ARGUMENT).toBe("INVALID_ARGUMENT");
      expect(GrpcErrorCode.DEADLINE_EXCEEDED).toBe("DEADLINE_EXCEEDED");
      expect(GrpcErrorCode.NOT_FOUND).toBe("NOT_FOUND");
      expect(GrpcErrorCode.ALREADY_EXISTS).toBe("ALREADY_EXISTS");
      expect(GrpcErrorCode.PERMISSION_DENIED).toBe("PERMISSION_DENIED");
      expect(GrpcErrorCode.RESOURCE_EXHAUSTED).toBe("RESOURCE_EXHAUSTED");
      expect(GrpcErrorCode.FAILED_PRECONDITION).toBe("FAILED_PRECONDITION");
      expect(GrpcErrorCode.ABORTED).toBe("ABORTED");
      expect(GrpcErrorCode.OUT_OF_RANGE).toBe("OUT_OF_RANGE");
      expect(GrpcErrorCode.UNIMPLEMENTED).toBe("UNIMPLEMENTED");
      expect(GrpcErrorCode.INTERNAL).toBe("INTERNAL");
      expect(GrpcErrorCode.UNAVAILABLE).toBe("UNAVAILABLE");
      expect(GrpcErrorCode.DATA_LOSS).toBe("DATA_LOSS");
      expect(GrpcErrorCode.UNAUTHENTICATED).toBe("UNAUTHENTICATED");
    });
  });
});
