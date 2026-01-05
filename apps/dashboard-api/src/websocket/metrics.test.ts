/**
 * WebSocket Metrics Tests
 *
 * Tests for Prometheus-compatible metrics collection.
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/ui/08-realtime.md lines 130-139
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  createHistogramBuckets,
  createMetricsRegistry,
  createWebSocketMetrics,
  DURATION_BUCKETS,
  formatLabels,
  type HistogramBuckets,
  LATENCY_BUCKETS,
  type Labels,
  labelsToKey,
  METRIC_HELP,
  type Metric,
  type MetricOutput,
  type MetricsRegistry,
  type MetricType,
  observeHistogram,
  SIZE_BUCKETS,
  type WebSocketMetrics,
  WS_METRICS,
} from "./metrics";

// ============================================
// Utility Function Tests
// ============================================

describe("labelsToKey", () => {
  it("returns empty string for empty labels", () => {
    expect(labelsToKey({})).toBe("");
  });

  it("formats single label", () => {
    expect(labelsToKey({ type: "subscribe" })).toBe('type="subscribe"');
  });

  it("formats multiple labels sorted alphabetically", () => {
    const key = labelsToKey({ z: "last", a: "first", m: "middle" });
    expect(key).toBe('a="first",m="middle",z="last"');
  });

  it("handles undefined labels", () => {
    expect(labelsToKey(undefined)).toBe("");
  });
});

describe("formatLabels", () => {
  it("returns empty string for empty labels", () => {
    expect(formatLabels({})).toBe("");
  });

  it("formats single label with braces", () => {
    expect(formatLabels({ type: "connect" })).toBe('{type="connect"}');
  });

  it("formats multiple labels", () => {
    const result = formatLabels({ user: "123", action: "subscribe" });
    expect(result).toContain("user=");
    expect(result).toContain("action=");
    expect(result.startsWith("{")).toBe(true);
    expect(result.endsWith("}")).toBe(true);
  });
});

describe("createHistogramBuckets", () => {
  it("creates histogram with correct boundaries", () => {
    const buckets = createHistogramBuckets([10, 50, 100]);
    expect(buckets.boundaries).toEqual([10, 50, 100]);
  });

  it("initializes counts array with zeros", () => {
    const buckets = createHistogramBuckets([10, 50, 100]);
    expect(buckets.counts.length).toBe(4); // boundaries + 1 for +Inf
    expect(buckets.counts.every((c) => c === 0)).toBe(true);
  });

  it("initializes sum and count to zero", () => {
    const buckets = createHistogramBuckets([10, 50, 100]);
    expect(buckets.sum).toBe(0);
    expect(buckets.count).toBe(0);
  });
});

describe("observeHistogram", () => {
  it("increments correct bucket for value", () => {
    const buckets = createHistogramBuckets([10, 50, 100]);
    observeHistogram(buckets, 5);
    expect(buckets.counts[0]).toBe(1); // <= 10
  });

  it("increments higher bucket for larger value", () => {
    const buckets = createHistogramBuckets([10, 50, 100]);
    observeHistogram(buckets, 75);
    expect(buckets.counts[2]).toBe(1); // <= 100
  });

  it("increments +Inf bucket for values above max", () => {
    const buckets = createHistogramBuckets([10, 50, 100]);
    observeHistogram(buckets, 500);
    expect(buckets.counts[3]).toBe(1); // +Inf
  });

  it("updates sum and count", () => {
    const buckets = createHistogramBuckets([10, 50, 100]);
    observeHistogram(buckets, 25);
    observeHistogram(buckets, 75);
    expect(buckets.sum).toBe(100);
    expect(buckets.count).toBe(2);
  });

  it("handles boundary values", () => {
    const buckets = createHistogramBuckets([10, 50, 100]);
    observeHistogram(buckets, 10);
    expect(buckets.counts[0]).toBe(1); // value == boundary goes in that bucket
  });
});

// ============================================
// Constants Tests
// ============================================

describe("LATENCY_BUCKETS", () => {
  it("has expected latency values", () => {
    expect(LATENCY_BUCKETS).toContain(5);
    expect(LATENCY_BUCKETS).toContain(100);
    expect(LATENCY_BUCKETS).toContain(1000);
  });

  it("is sorted ascending", () => {
    for (let i = 1; i < LATENCY_BUCKETS.length; i++) {
      const current = LATENCY_BUCKETS[i];
      const previous = LATENCY_BUCKETS[i - 1];
      if (current !== undefined && previous !== undefined) {
        expect(current).toBeGreaterThan(previous);
      }
    }
  });
});

describe("SIZE_BUCKETS", () => {
  it("has expected size values", () => {
    expect(SIZE_BUCKETS).toContain(64);
    expect(SIZE_BUCKETS).toContain(1024);
    expect(SIZE_BUCKETS).toContain(8192);
  });

  it("is sorted ascending", () => {
    for (let i = 1; i < SIZE_BUCKETS.length; i++) {
      const current = SIZE_BUCKETS[i];
      const previous = SIZE_BUCKETS[i - 1];
      if (current !== undefined && previous !== undefined) {
        expect(current).toBeGreaterThan(previous);
      }
    }
  });
});

describe("DURATION_BUCKETS", () => {
  it("has expected duration values in seconds", () => {
    expect(DURATION_BUCKETS).toContain(1);
    expect(DURATION_BUCKETS).toContain(60);
    expect(DURATION_BUCKETS).toContain(3600);
  });

  it("is sorted ascending", () => {
    for (let i = 1; i < DURATION_BUCKETS.length; i++) {
      const current = DURATION_BUCKETS[i];
      const previous = DURATION_BUCKETS[i - 1];
      if (current !== undefined && previous !== undefined) {
        expect(current).toBeGreaterThan(previous);
      }
    }
  });
});

describe("WS_METRICS", () => {
  it("has connection metrics", () => {
    expect(WS_METRICS.ACTIVE_CONNECTIONS).toBe("ws_active_connections");
    expect(WS_METRICS.TOTAL_CONNECTIONS).toBe("ws_connections_total");
    expect(WS_METRICS.CONNECTION_ERRORS).toBe("ws_connection_errors_total");
  });

  it("has message metrics", () => {
    expect(WS_METRICS.MESSAGES_RECEIVED).toBe("ws_messages_received_total");
    expect(WS_METRICS.MESSAGES_SENT).toBe("ws_messages_sent_total");
    expect(WS_METRICS.MESSAGE_ERRORS).toBe("ws_message_errors_total");
  });

  it("has latency metrics", () => {
    expect(WS_METRICS.BROADCAST_LATENCY).toBe("ws_broadcast_latency_ms");
    expect(WS_METRICS.ROUNDTRIP_LATENCY).toBe("ws_roundtrip_latency_ms");
  });

  it("has subscription metrics", () => {
    expect(WS_METRICS.SUBSCRIBED_CHANNELS).toBe("ws_subscribed_channels");
    expect(WS_METRICS.SUBSCRIBED_SYMBOLS).toBe("ws_subscribed_symbols");
  });

  it("has heartbeat metrics", () => {
    expect(WS_METRICS.HEARTBEAT_LATENCY).toBe("ws_heartbeat_latency_ms");
    expect(WS_METRICS.HEARTBEAT_TIMEOUTS).toBe("ws_heartbeat_timeouts_total");
  });
});

describe("METRIC_HELP", () => {
  it("has help text for all metrics", () => {
    const metricKeys = Object.values(WS_METRICS);
    for (const key of metricKeys) {
      expect(METRIC_HELP[key]).toBeDefined();
      expect(typeof METRIC_HELP[key]).toBe("string");
    }
  });

  it("help text is descriptive", () => {
    expect(METRIC_HELP[WS_METRICS.ACTIVE_CONNECTIONS]).toContain("active");
    expect(METRIC_HELP[WS_METRICS.BROADCAST_LATENCY]).toContain("broadcast");
  });
});

// ============================================
// MetricsRegistry Tests
// ============================================

describe("createMetricsRegistry", () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = createMetricsRegistry();
  });

  it("creates registry with empty metrics map", () => {
    expect(registry.metrics.size).toBe(0);
  });

  describe("inc (counter)", () => {
    it("increments counter by 1 by default", () => {
      registry.inc("test_counter");
      const metric = registry.metrics.get("test_counter");
      expect(metric?.values.get("")).toBe(1);
    });

    it("increments counter by specified value", () => {
      registry.inc("test_counter", {}, 5);
      const metric = registry.metrics.get("test_counter");
      expect(metric?.values.get("")).toBe(5);
    });

    it("accumulates counter values", () => {
      registry.inc("test_counter");
      registry.inc("test_counter");
      registry.inc("test_counter", {}, 3);
      const metric = registry.metrics.get("test_counter");
      expect(metric?.values.get("")).toBe(5);
    });

    it("separates values by labels", () => {
      registry.inc("test_counter", { type: "a" });
      registry.inc("test_counter", { type: "b" }, 2);
      const metric = registry.metrics.get("test_counter");
      expect(metric?.values.get('type="a"')).toBe(1);
      expect(metric?.values.get('type="b"')).toBe(2);
    });

    it("sets metric type to counter", () => {
      registry.inc("test_counter");
      const metric = registry.metrics.get("test_counter");
      expect(metric?.type).toBe("counter");
    });
  });

  describe("set (gauge)", () => {
    it("sets gauge value", () => {
      registry.set("test_gauge", 42);
      const metric = registry.metrics.get("test_gauge");
      expect(metric?.values.get("")).toBe(42);
    });

    it("overwrites previous value", () => {
      registry.set("test_gauge", 10);
      registry.set("test_gauge", 20);
      const metric = registry.metrics.get("test_gauge");
      expect(metric?.values.get("")).toBe(20);
    });

    it("sets metric type to gauge", () => {
      registry.set("test_gauge", 42);
      const metric = registry.metrics.get("test_gauge");
      expect(metric?.type).toBe("gauge");
    });
  });

  describe("incGauge", () => {
    it("increments gauge by 1 by default", () => {
      registry.set("test_gauge", 10);
      registry.incGauge("test_gauge");
      const metric = registry.metrics.get("test_gauge");
      expect(metric?.values.get("")).toBe(11);
    });

    it("increments gauge by specified value", () => {
      registry.set("test_gauge", 10);
      registry.incGauge("test_gauge", {}, 5);
      const metric = registry.metrics.get("test_gauge");
      expect(metric?.values.get("")).toBe(15);
    });
  });

  describe("decGauge", () => {
    it("decrements gauge by 1 by default", () => {
      registry.set("test_gauge", 10);
      registry.decGauge("test_gauge");
      const metric = registry.metrics.get("test_gauge");
      expect(metric?.values.get("")).toBe(9);
    });

    it("decrements gauge by specified value", () => {
      registry.set("test_gauge", 10);
      registry.decGauge("test_gauge", {}, 3);
      const metric = registry.metrics.get("test_gauge");
      expect(metric?.values.get("")).toBe(7);
    });
  });

  describe("observe (histogram)", () => {
    it("records observation in histogram", () => {
      registry.observe("test_histogram", 15);
      const metric = registry.metrics.get("test_histogram");
      expect(metric?.type).toBe("histogram");
    });

    it("accumulates observations", () => {
      registry.observe("test_histogram", 10);
      registry.observe("test_histogram", 20);
      const metric = registry.metrics.get("test_histogram");
      const histogram = metric?.values.get("") as HistogramBuckets;
      expect(histogram.count).toBe(2);
      expect(histogram.sum).toBe(30);
    });

    it("uses latency buckets for latency metrics", () => {
      registry.observe("test_latency_ms", 100);
      const metric = registry.metrics.get("test_latency_ms");
      const histogram = metric?.values.get("") as HistogramBuckets;
      expect(histogram.boundaries).toEqual(LATENCY_BUCKETS);
    });

    it("uses size buckets for size metrics", () => {
      registry.observe("test_size_bytes", 512);
      const metric = registry.metrics.get("test_size_bytes");
      const histogram = metric?.values.get("") as HistogramBuckets;
      expect(histogram.boundaries).toEqual(SIZE_BUCKETS);
    });

    it("uses duration buckets for duration metrics", () => {
      registry.observe("test_duration_seconds", 60);
      const metric = registry.metrics.get("test_duration_seconds");
      const histogram = metric?.values.get("") as HistogramBuckets;
      expect(histogram.boundaries).toEqual(DURATION_BUCKETS);
    });
  });

  describe("getMetrics", () => {
    it("returns empty array for empty registry", () => {
      expect(registry.getMetrics()).toEqual([]);
    });

    it("returns metric outputs", () => {
      registry.inc("test_counter");
      const metrics = registry.getMetrics();
      expect(metrics.length).toBe(1);
      const firstMetric = metrics[0];
      expect(firstMetric?.name).toBe("test_counter");
      expect(firstMetric?.type).toBe("counter");
    });

    it("includes samples with labels", () => {
      registry.inc("test_counter", { type: "a" });
      const metrics = registry.getMetrics();
      const firstMetric = metrics[0];
      const firstSample = firstMetric?.samples[0];
      expect(firstSample?.labels).toEqual({ type: "a" });
      expect(firstSample?.value).toBe(1);
    });

    it("formats histogram with bucket samples", () => {
      registry.observe("test_latency", 15);
      const metrics = registry.getMetrics();
      const latencyMetric = metrics.find((m) => m.name === "test_latency");
      expect(latencyMetric?.samples.some((s) => s.labels.le === "+Inf")).toBe(true);
    });
  });

  describe("toPrometheus", () => {
    it("returns empty string for empty registry", () => {
      expect(registry.toPrometheus()).toBe("");
    });

    it("includes HELP comments", () => {
      registry.inc(WS_METRICS.TOTAL_CONNECTIONS);
      const output = registry.toPrometheus();
      expect(output).toContain("# HELP ws_connections_total");
    });

    it("includes TYPE comments", () => {
      registry.inc(WS_METRICS.TOTAL_CONNECTIONS);
      const output = registry.toPrometheus();
      expect(output).toContain("# TYPE ws_connections_total counter");
    });

    it("formats counter values", () => {
      registry.inc("test_counter", {}, 42);
      const output = registry.toPrometheus();
      expect(output).toContain("test_counter 42");
    });

    it("formats counter with labels", () => {
      registry.inc("test_counter", { type: "connect" }, 5);
      const output = registry.toPrometheus();
      expect(output).toContain('test_counter{type="connect"} 5');
    });

    it("formats histogram with buckets", () => {
      registry.observe("test_latency", 15);
      const output = registry.toPrometheus();
      expect(output).toContain("test_latency_bucket");
      expect(output).toContain('le="');
      expect(output).toContain('+Inf"');
      expect(output).toContain("test_latency_sum");
      expect(output).toContain("test_latency_count");
    });
  });

  describe("reset", () => {
    it("clears all metrics", () => {
      registry.inc("test_counter");
      registry.set("test_gauge", 42);
      registry.reset();
      expect(registry.metrics.size).toBe(0);
    });
  });
});

// ============================================
// WebSocketMetrics Tests
// ============================================

describe("createWebSocketMetrics", () => {
  let metrics: WebSocketMetrics;

  beforeEach(() => {
    metrics = createWebSocketMetrics();
  });

  it("has registry property", () => {
    expect(metrics.registry).toBeDefined();
  });

  it("starts with 0 active connections", () => {
    expect(metrics.getActiveConnections()).toBe(0);
  });

  describe("connectionOpened", () => {
    it("increments active connections", () => {
      metrics.connectionOpened();
      expect(metrics.getActiveConnections()).toBe(1);
    });

    it("increments total connections counter", () => {
      metrics.connectionOpened();
      const metric = metrics.registry.metrics.get(WS_METRICS.TOTAL_CONNECTIONS);
      expect(metric?.values.get("")).toBe(1);
    });

    it("tracks connections by user", () => {
      metrics.connectionOpened("user-123");
      const metric = metrics.registry.metrics.get(WS_METRICS.TOTAL_CONNECTIONS);
      expect(metric?.values.get('user_id="user-123"')).toBe(1);
    });
  });

  describe("connectionClosed", () => {
    it("decrements active connections", () => {
      metrics.connectionOpened();
      metrics.connectionOpened();
      metrics.connectionClosed(60);
      expect(metrics.getActiveConnections()).toBe(1);
    });

    it("does not go below 0", () => {
      metrics.connectionClosed(60);
      expect(metrics.getActiveConnections()).toBe(0);
    });

    it("records connection duration", () => {
      metrics.connectionClosed(120.5);
      const metric = metrics.registry.metrics.get(WS_METRICS.CONNECTION_DURATION);
      expect(metric?.type).toBe("histogram");
    });
  });

  describe("connectionError", () => {
    it("increments connection errors by reason", () => {
      metrics.connectionError("timeout");
      const metric = metrics.registry.metrics.get(WS_METRICS.CONNECTION_ERRORS);
      expect(metric?.values.get('reason="timeout"')).toBe(1);
    });
  });

  describe("messageReceived", () => {
    it("increments message counter by type", () => {
      metrics.messageReceived("subscribe", 128);
      const metric = metrics.registry.metrics.get(WS_METRICS.MESSAGES_RECEIVED);
      expect(metric?.values.get('type="subscribe"')).toBe(1);
    });

    it("records message size", () => {
      metrics.messageReceived("subscribe", 256);
      const metric = metrics.registry.metrics.get(WS_METRICS.MESSAGE_SIZE_RECEIVED);
      expect(metric?.type).toBe("histogram");
    });
  });

  describe("messageSent", () => {
    it("increments sent message counter", () => {
      metrics.messageSent("quote", 512);
      const metric = metrics.registry.metrics.get(WS_METRICS.MESSAGES_SENT);
      expect(metric?.values.get('type="quote"')).toBe(1);
    });

    it("records sent message size", () => {
      metrics.messageSent("quote", 512);
      const metric = metrics.registry.metrics.get(WS_METRICS.MESSAGE_SIZE_SENT);
      expect(metric?.type).toBe("histogram");
    });
  });

  describe("messageError", () => {
    it("increments message errors by reason", () => {
      metrics.messageError("invalid_json");
      const metric = metrics.registry.metrics.get(WS_METRICS.MESSAGE_ERRORS);
      expect(metric?.values.get('reason="invalid_json"')).toBe(1);
    });
  });

  describe("observeBroadcastLatency", () => {
    it("records broadcast latency", () => {
      metrics.observeBroadcastLatency(15.5);
      const metric = metrics.registry.metrics.get(WS_METRICS.BROADCAST_LATENCY);
      expect(metric?.type).toBe("histogram");
    });
  });

  describe("observeRoundtripLatency", () => {
    it("records roundtrip latency", () => {
      metrics.observeRoundtripLatency(25.0);
      const metric = metrics.registry.metrics.get(WS_METRICS.ROUNDTRIP_LATENCY);
      expect(metric?.type).toBe("histogram");
    });
  });

  describe("updateChannelSubscriptions", () => {
    it("sets channel subscription count", () => {
      metrics.updateChannelSubscriptions(5);
      const metric = metrics.registry.metrics.get(WS_METRICS.SUBSCRIBED_CHANNELS);
      expect(metric?.values.get("")).toBe(5);
    });
  });

  describe("updateSymbolSubscriptions", () => {
    it("sets symbol subscription count", () => {
      metrics.updateSymbolSubscriptions(10);
      const metric = metrics.registry.metrics.get(WS_METRICS.SUBSCRIBED_SYMBOLS);
      expect(metric?.values.get("")).toBe(10);
    });
  });

  describe("rateLimitViolation", () => {
    it("increments rate limit violations by reason", () => {
      metrics.rateLimitViolation("messages_per_second");
      const metric = metrics.registry.metrics.get(WS_METRICS.RATE_LIMIT_VIOLATIONS);
      expect(metric?.values.get('reason="messages_per_second"')).toBe(1);
    });
  });

  describe("observeQuoteBatchSize", () => {
    it("records quote batch size", () => {
      metrics.observeQuoteBatchSize(50);
      const metric = metrics.registry.metrics.get(WS_METRICS.QUOTE_BATCH_SIZE);
      expect(metric?.type).toBe("histogram");
    });
  });

  describe("observeQuoteThrottleDiscards", () => {
    it("increments throttle discards by symbol", () => {
      metrics.observeQuoteThrottleDiscards("AAPL", 5);
      const metric = metrics.registry.metrics.get(WS_METRICS.QUOTE_THROTTLE_DISCARDS);
      expect(metric?.values.get('symbol="AAPL"')).toBe(5);
    });
  });

  describe("observeHeartbeatLatency", () => {
    it("records heartbeat latency", () => {
      metrics.observeHeartbeatLatency(5.2);
      const metric = metrics.registry.metrics.get(WS_METRICS.HEARTBEAT_LATENCY);
      expect(metric?.type).toBe("histogram");
    });
  });

  describe("heartbeatTimeout", () => {
    it("increments heartbeat timeouts", () => {
      metrics.heartbeatTimeout();
      const metric = metrics.registry.metrics.get(WS_METRICS.HEARTBEAT_TIMEOUTS);
      expect(metric?.values.get("")).toBe(1);
    });
  });

  describe("toPrometheus", () => {
    it("returns Prometheus format output", () => {
      metrics.connectionOpened();
      metrics.messageReceived("subscribe", 128);
      const output = metrics.toPrometheus();
      expect(output).toContain("# HELP");
      expect(output).toContain("# TYPE");
    });
  });
});

// ============================================
// Type Tests
// ============================================

describe("MetricType Type", () => {
  it("includes counter", () => {
    const type: MetricType = "counter";
    expect(type).toBe("counter");
  });

  it("includes gauge", () => {
    const type: MetricType = "gauge";
    expect(type).toBe("gauge");
  });

  it("includes histogram", () => {
    const type: MetricType = "histogram";
    expect(type).toBe("histogram");
  });
});

describe("Labels Type", () => {
  it("is a string record", () => {
    const labels: Labels = { key: "value", another: "test" };
    expect(labels.key).toBe("value");
  });
});

describe("HistogramBuckets Type", () => {
  it("has required fields", () => {
    const buckets: HistogramBuckets = {
      boundaries: [10, 50, 100],
      counts: [0, 0, 0, 0],
      sum: 0,
      count: 0,
    };
    expect(buckets.boundaries).toBeDefined();
    expect(buckets.counts).toBeDefined();
    expect(buckets.sum).toBeDefined();
    expect(buckets.count).toBeDefined();
  });
});

describe("Metric Type", () => {
  it("has required fields", () => {
    const metric: Metric = {
      name: "test_metric",
      type: "counter",
      help: "Test metric",
      values: new Map(),
    };
    expect(metric.name).toBeDefined();
    expect(metric.type).toBeDefined();
    expect(metric.help).toBeDefined();
    expect(metric.values).toBeDefined();
  });
});

describe("MetricOutput Type", () => {
  it("has required fields", () => {
    const output: MetricOutput = {
      name: "test_metric",
      type: "counter",
      help: "Test metric",
      samples: [{ labels: {}, value: 1 }],
    };
    expect(output.name).toBeDefined();
    expect(output.type).toBeDefined();
    expect(output.help).toBeDefined();
    expect(output.samples).toBeDefined();
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports createMetricsRegistry", async () => {
    const module = await import("./metrics");
    expect(typeof module.createMetricsRegistry).toBe("function");
  });

  it("exports createWebSocketMetrics", async () => {
    const module = await import("./metrics");
    expect(typeof module.createWebSocketMetrics).toBe("function");
  });

  it("exports default as createWebSocketMetrics", async () => {
    const module = await import("./metrics");
    expect(module.default).toBe(module.createWebSocketMetrics);
  });

  it("exports utility functions", async () => {
    const module = await import("./metrics");
    expect(typeof module.labelsToKey).toBe("function");
    expect(typeof module.formatLabels).toBe("function");
    expect(typeof module.createHistogramBuckets).toBe("function");
    expect(typeof module.observeHistogram).toBe("function");
  });

  it("exports constants", async () => {
    const module = await import("./metrics");
    expect(module.LATENCY_BUCKETS).toBeDefined();
    expect(module.SIZE_BUCKETS).toBeDefined();
    expect(module.DURATION_BUCKETS).toBeDefined();
    expect(module.WS_METRICS).toBeDefined();
    expect(module.METRIC_HELP).toBeDefined();
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
  it("full connection lifecycle metrics", () => {
    const metrics = createWebSocketMetrics();

    // Connection opens
    metrics.connectionOpened("user-123");
    expect(metrics.getActiveConnections()).toBe(1);

    // Messages flow
    metrics.messageReceived("subscribe", 64);
    metrics.messageSent("quote", 256);
    metrics.messageSent("quote", 512);

    // Heartbeats
    metrics.observeHeartbeatLatency(5);
    metrics.observeHeartbeatLatency(7);

    // Connection closes
    metrics.connectionClosed(300, "user-123");
    expect(metrics.getActiveConnections()).toBe(0);

    // Verify Prometheus output
    const output = metrics.toPrometheus();
    expect(output).toContain("ws_active_connections");
    expect(output).toContain("ws_connections_total");
    expect(output).toContain("ws_messages_received_total");
    expect(output).toContain("ws_messages_sent_total");
    expect(output).toContain("ws_heartbeat_latency_ms");
    expect(output).toContain("ws_connection_duration_seconds");
  });

  it("multiple connections with different labels", () => {
    const metrics = createWebSocketMetrics();

    metrics.connectionOpened("user-a");
    metrics.connectionOpened("user-b");
    metrics.connectionOpened("user-a");

    expect(metrics.getActiveConnections()).toBe(3);

    const counter = metrics.registry.metrics.get(WS_METRICS.TOTAL_CONNECTIONS);
    const userACount = counter?.values.get('user_id="user-a"');
    const userBCount = counter?.values.get('user_id="user-b"');
    expect(userACount).toBe(2);
    expect(userBCount).toBe(1);
  });

  it("histogram cumulative buckets", () => {
    const metrics = createWebSocketMetrics();

    // Observe values in different buckets
    metrics.observeBroadcastLatency(5); // <= 5
    metrics.observeBroadcastLatency(15); // <= 25
    metrics.observeBroadcastLatency(100); // <= 100
    metrics.observeBroadcastLatency(500); // <= 500

    const output = metrics.toPrometheus();

    // Verify cumulative counts in Prometheus output
    expect(output).toContain("ws_broadcast_latency_ms_bucket");
    expect(output).toContain("ws_broadcast_latency_ms_sum 620");
    expect(output).toContain("ws_broadcast_latency_ms_count 4");
  });
});
