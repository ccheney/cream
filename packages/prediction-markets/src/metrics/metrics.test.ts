/**
 * Tests for Prediction Markets Metrics
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  createPredictionMarketMetrics,
  getDefaultMetrics,
  recordApiCall,
  recordApiError,
  recordCacheAccess,
  resetDefaultMetrics,
  setMarketCount,
  setWebsocketState,
  updateSignalFreshness,
} from "./index";

describe("createPredictionMarketMetrics", () => {
  test("creates metrics with default prefix", async () => {
    const metrics = createPredictionMarketMetrics();

    const output = await metrics.registry.metrics();
    expect(output).toContain("prediction_market_api_latency_seconds");
    expect(output).toContain("prediction_market_cache_hits_total");
    expect(output).toContain("prediction_market_signal_age_seconds");
  });

  test("creates metrics with custom prefix", async () => {
    const metrics = createPredictionMarketMetrics({ prefix: "custom_pm" });

    const output = await metrics.registry.metrics();
    expect(output).toContain("custom_pm_api_latency_seconds");
    expect(output).toContain("custom_pm_cache_hits_total");
  });

  test("creates isolated registry", () => {
    const metrics1 = createPredictionMarketMetrics();
    const metrics2 = createPredictionMarketMetrics();

    expect(metrics1.registry).not.toBe(metrics2.registry);
  });
});

describe("recordApiCall", () => {
  test("records latency histogram observation", async () => {
    const metrics = createPredictionMarketMetrics();

    recordApiCall(metrics, "kalshi", "getMarkets", 150);
    recordApiCall(metrics, "kalshi", "getMarkets", 250);
    recordApiCall(metrics, "polymarket", "search", 300);

    const output = await metrics.registry.metrics();
    expect(output).toContain('platform="kalshi"');
    expect(output).toContain('endpoint="getMarkets"');
    expect(output).toContain('platform="polymarket"');
    expect(output).toContain('endpoint="search"');
  });

  test("increments request counter", async () => {
    const metrics = createPredictionMarketMetrics();

    recordApiCall(metrics, "kalshi", "getMarkets", 100);
    recordApiCall(metrics, "kalshi", "getMarkets", 100);
    recordApiCall(metrics, "kalshi", "getMarkets", 100);

    const output = await metrics.registry.metrics();
    expect(output).toContain("prediction_market_requests_total");
  });
});

describe("recordApiError", () => {
  test("increments error counter by type", async () => {
    const metrics = createPredictionMarketMetrics();

    recordApiError(metrics, "kalshi", "auth");
    recordApiError(metrics, "kalshi", "rate_limit");
    recordApiError(metrics, "polymarket", "network");

    const output = await metrics.registry.metrics();
    expect(output).toContain('error_type="auth"');
    expect(output).toContain('error_type="rate_limit"');
    expect(output).toContain('error_type="network"');
  });
});

describe("recordCacheAccess", () => {
  test("records cache hits", async () => {
    const metrics = createPredictionMarketMetrics();

    recordCacheAccess(metrics, true);
    recordCacheAccess(metrics, true);
    recordCacheAccess(metrics, false);

    const output = await metrics.registry.metrics();
    expect(output).toContain('status="hit"');
    expect(output).toContain('status="miss"');
  });
});

describe("updateSignalFreshness", () => {
  test("sets signal timestamp", async () => {
    const metrics = createPredictionMarketMetrics();
    const beforeTime = Date.now() / 1000;

    updateSignalFreshness(metrics, "fed_rate");
    updateSignalFreshness(metrics, "recession");

    const afterTime = Date.now() / 1000;
    const output = await metrics.registry.metrics();

    expect(output).toContain('signal_type="fed_rate"');
    expect(output).toContain('signal_type="recession"');

    // Parse the metric value to verify it's a reasonable timestamp
    const match = output.match(
      /prediction_market_signal_age_seconds\{signal_type="fed_rate"\}\s+(\d+\.?\d*)/
    );
    expect(match).not.toBeNull();
    const value = parseFloat(match![1]);
    expect(value).toBeGreaterThanOrEqual(beforeTime);
    expect(value).toBeLessThanOrEqual(afterTime);
  });
});

describe("setWebsocketState", () => {
  test("sets connected state to 1", async () => {
    const metrics = createPredictionMarketMetrics();

    setWebsocketState(metrics, "kalshi", true);

    const output = await metrics.registry.metrics();
    expect(output).toContain('prediction_market_websocket_connected{platform="kalshi"} 1');
  });

  test("sets disconnected state to 0", async () => {
    const metrics = createPredictionMarketMetrics();

    setWebsocketState(metrics, "polymarket", false);

    const output = await metrics.registry.metrics();
    expect(output).toContain('prediction_market_websocket_connected{platform="polymarket"} 0');
  });
});

describe("setMarketCount", () => {
  test("sets active market count", async () => {
    const metrics = createPredictionMarketMetrics();

    setMarketCount(metrics, "kalshi", "fed_rate", 15);
    setMarketCount(metrics, "polymarket", "election", 42);

    const output = await metrics.registry.metrics();
    expect(output).toContain('platform="kalshi"');
    expect(output).toContain('market_type="fed_rate"');
    expect(output).toContain('platform="polymarket"');
    expect(output).toContain('market_type="election"');
  });
});

describe("getDefaultMetrics", () => {
  afterEach(() => {
    resetDefaultMetrics();
  });

  test("returns singleton instance", () => {
    const metrics1 = getDefaultMetrics();
    const metrics2 = getDefaultMetrics();

    expect(metrics1).toBe(metrics2);
  });

  test("resetDefaultMetrics clears and resets singleton", () => {
    const metrics1 = getDefaultMetrics();
    recordApiCall(metrics1, "kalshi", "test", 100);

    resetDefaultMetrics();

    const metrics2 = getDefaultMetrics();
    expect(metrics2).not.toBe(metrics1);
  });
});

describe("Metric Types", () => {
  test("apiLatency is a histogram with correct buckets", async () => {
    const metrics = createPredictionMarketMetrics();

    // Record a single observation
    recordApiCall(metrics, "kalshi", "test", 500);

    const output = await metrics.registry.metrics();
    // Check histogram buckets exist
    expect(output).toContain("_bucket{");
    expect(output).toContain('le="0.1"');
    expect(output).toContain('le="0.5"');
    expect(output).toContain('le="1"');
    expect(output).toContain('le="5"');
  });

  test("counters only increase", async () => {
    const metrics = createPredictionMarketMetrics();

    recordCacheAccess(metrics, true);
    recordCacheAccess(metrics, true);
    recordCacheAccess(metrics, true);

    // Can't decrease a counter - this is enforced by prom-client
    const output = await metrics.registry.metrics();
    const match = output.match(/prediction_market_cache_hits_total\{status="hit"\}\s+(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1])).toBe(3);
  });

  test("gauges can be set to any value", async () => {
    const metrics = createPredictionMarketMetrics();

    setMarketCount(metrics, "kalshi", "test", 100);
    setMarketCount(metrics, "kalshi", "test", 50);
    setMarketCount(metrics, "kalshi", "test", 200);

    const output = await metrics.registry.metrics();
    expect(output).toContain("200");
  });
});
