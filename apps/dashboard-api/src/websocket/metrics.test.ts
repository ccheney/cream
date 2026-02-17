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

function getHistogram(metric: Metric | undefined): HistogramBuckets {
	const histogram = metric?.values.get("") as HistogramBuckets | undefined;
	if (!histogram) {
		throw new Error("Expected histogram metric");
	}
	return histogram;
}

describe("labelsToKey", () => {
	it("handles empty, undefined, and sorted labels", () => {
		expect(labelsToKey({})).toBe("");
		expect(labelsToKey(undefined)).toBe("");
		expect(labelsToKey({ type: "subscribe" })).toBe('type="subscribe"');
		expect(labelsToKey({ z: "last", a: "first", m: "middle" })).toBe(
			'a="first",m="middle",z="last"',
		);
	});
});

describe("formatLabels", () => {
	it("formats labels with braces", () => {
		expect(formatLabels({})).toBe("");
		expect(formatLabels({ type: "connect" })).toBe('{type="connect"}');
		const result = formatLabels({ user: "123", action: "subscribe" });
		expect(result).toContain("user=");
		expect(result).toContain("action=");
		expect(result.startsWith("{")).toBe(true);
		expect(result.endsWith("}")).toBe(true);
	});
});

describe("createHistogramBuckets", () => {
	it("creates buckets with zeroed counts, sum, and count", () => {
		const buckets = createHistogramBuckets([10, 50, 100]);
		expect(buckets.boundaries).toEqual([10, 50, 100]);
		expect(buckets.counts).toEqual([0, 0, 0, 0]);
		expect(buckets.sum).toBe(0);
		expect(buckets.count).toBe(0);
	});
});

describe("observeHistogram", () => {
	it("places observations into buckets and updates totals", () => {
		const buckets = createHistogramBuckets([10, 50, 100]);
		observeHistogram(buckets, 5);
		observeHistogram(buckets, 75);
		observeHistogram(buckets, 500);
		observeHistogram(buckets, 10);
		expect(buckets.counts[0]).toBe(2);
		expect(buckets.counts[2]).toBe(1);
		expect(buckets.counts[3]).toBe(1);
		expect(buckets.sum).toBe(590);
		expect(buckets.count).toBe(4);
	});
});

describe("Metric bucket constants", () => {
	it("include expected values and are ascending", () => {
		expect(LATENCY_BUCKETS).toContain(5);
		expect(LATENCY_BUCKETS).toContain(1000);
		expect(SIZE_BUCKETS).toContain(64);
		expect(SIZE_BUCKETS).toContain(8192);
		expect(DURATION_BUCKETS).toContain(1);
		expect(DURATION_BUCKETS).toContain(3600);
		for (const buckets of [LATENCY_BUCKETS, SIZE_BUCKETS, DURATION_BUCKETS]) {
			for (let i = 1; i < buckets.length; i++) {
				const previous = buckets[i - 1];
				const current = buckets[i];
				if (previous !== undefined && current !== undefined) {
					expect(current).toBeGreaterThan(previous);
				}
			}
		}
	});
});

describe("WS_METRICS and METRIC_HELP", () => {
	it("expose core metric names and help text", () => {
		expect(WS_METRICS.ACTIVE_CONNECTIONS).toBe("ws_active_connections");
		expect(WS_METRICS.MESSAGES_RECEIVED).toBe("ws_messages_received_total");
		expect(WS_METRICS.BROADCAST_LATENCY).toBe("ws_broadcast_latency_ms");
		expect(WS_METRICS.SUBSCRIBED_SYMBOLS).toBe("ws_subscribed_symbols");
		expect(WS_METRICS.HEARTBEAT_TIMEOUTS).toBe("ws_heartbeat_timeouts_total");
		for (const key of Object.values(WS_METRICS)) {
			expect(typeof METRIC_HELP[key]).toBe("string");
		}
		expect(METRIC_HELP[WS_METRICS.ACTIVE_CONNECTIONS]).toContain("active");
		expect(METRIC_HELP[WS_METRICS.BROADCAST_LATENCY]).toContain("broadcast");
	});
});

describe("createMetricsRegistry - counters and gauges", () => {
	let registry: MetricsRegistry;

	beforeEach(() => {
		registry = createMetricsRegistry();
	});

	it("starts empty", () => {
		expect(registry.metrics.size).toBe(0);
	});

	it("increments counters with labels", () => {
		registry.inc("test_counter");
		registry.inc("test_counter", {}, 3);
		registry.inc("test_counter", { type: "a" });
		registry.inc("test_counter", { type: "b" }, 2);
		const metric = registry.metrics.get("test_counter");
		expect(metric?.type).toBe("counter");
		expect(metric?.values.get("")).toBe(4);
		expect(metric?.values.get('type="a"')).toBe(1);
		expect(metric?.values.get('type="b"')).toBe(2);
	});

	it("sets and updates gauges", () => {
		registry.set("test_gauge", 10);
		registry.set("test_gauge", 20);
		registry.incGauge("test_gauge");
		registry.incGauge("test_gauge", {}, 5);
		registry.decGauge("test_gauge");
		registry.decGauge("test_gauge", {}, 3);
		const metric = registry.metrics.get("test_gauge");
		expect(metric?.type).toBe("gauge");
		expect(metric?.values.get("")).toBe(22);
	});
});

describe("createMetricsRegistry - histograms", () => {
	let registry: MetricsRegistry;

	beforeEach(() => {
		registry = createMetricsRegistry();
	});

	it("records histogram observations and bucket choice by metric name", () => {
		registry.observe("test_histogram", 10);
		registry.observe("test_histogram", 20);
		const histogram = getHistogram(registry.metrics.get("test_histogram"));
		expect(histogram.count).toBe(2);
		expect(histogram.sum).toBe(30);

		registry.observe("test_latency_ms", 100);
		registry.observe("test_size_bytes", 512);
		registry.observe("test_duration_seconds", 60);
		expect(getHistogram(registry.metrics.get("test_latency_ms")).boundaries).toEqual(
			LATENCY_BUCKETS,
		);
		expect(getHistogram(registry.metrics.get("test_size_bytes")).boundaries).toEqual(SIZE_BUCKETS);
		expect(getHistogram(registry.metrics.get("test_duration_seconds")).boundaries).toEqual(
			DURATION_BUCKETS,
		);
	});
});

describe("createMetricsRegistry - outputs", () => {
	let registry: MetricsRegistry;

	beforeEach(() => {
		registry = createMetricsRegistry();
	});

	it("returns metrics and samples", () => {
		expect(registry.getMetrics()).toEqual([]);
		registry.inc("test_counter", { type: "a" });
		registry.observe("test_latency", 15);
		const metrics = registry.getMetrics();
		expect(metrics.length).toBe(2);
		const counter = metrics.find((m) => m.name === "test_counter");
		expect(counter?.type).toBe("counter");
		expect(counter?.samples[0]?.labels).toEqual({ type: "a" });
		expect(counter?.samples[0]?.value).toBe(1);
		const latency = metrics.find((m) => m.name === "test_latency");
		expect(latency?.samples.some((s) => s.labels.le === "+Inf")).toBe(true);
	});

	it("formats Prometheus text for counters and histograms", () => {
		expect(registry.toPrometheus()).toBe("");
		registry.inc(WS_METRICS.TOTAL_CONNECTIONS);
		registry.inc("test_counter", { type: "connect" }, 5);
		registry.observe("test_latency", 15);
		const output = registry.toPrometheus();
		expect(output).toContain("# HELP ws_connections_total");
		expect(output).toContain("# TYPE ws_connections_total counter");
		expect(output).toContain('test_counter{type="connect"} 5');
		expect(output).toContain("test_latency_bucket");
		expect(output).toContain("test_latency_sum");
		expect(output).toContain("test_latency_count");
	});

	it("reset clears metrics", () => {
		registry.inc("test_counter");
		registry.set("test_gauge", 42);
		registry.reset();
		expect(registry.metrics.size).toBe(0);
	});
});

describe("createWebSocketMetrics - connection lifecycle", () => {
	let metrics: WebSocketMetrics;

	beforeEach(() => {
		metrics = createWebSocketMetrics();
	});

	it("tracks active and total connections", () => {
		expect(metrics.getActiveConnections()).toBe(0);
		metrics.connectionOpened("user-123");
		metrics.connectionOpened();
		expect(metrics.getActiveConnections()).toBe(2);
		const total = metrics.registry.metrics.get(WS_METRICS.TOTAL_CONNECTIONS);
		expect(total?.values.get("")).toBe(1);
		expect(total?.values.get('user_id="user-123"')).toBe(1);
		metrics.connectionClosed(60);
		metrics.connectionClosed(60);
		metrics.connectionClosed(60);
		expect(metrics.getActiveConnections()).toBe(0);
		expect(metrics.registry.metrics.get(WS_METRICS.CONNECTION_DURATION)?.type).toBe("histogram");
	});

	it("tracks connection errors by reason", () => {
		metrics.connectionError("timeout");
		const errors = metrics.registry.metrics.get(WS_METRICS.CONNECTION_ERRORS);
		expect(errors?.values.get('reason="timeout"')).toBe(1);
	});
});

describe("createWebSocketMetrics - message and latency", () => {
	let metrics: WebSocketMetrics;

	beforeEach(() => {
		metrics = createWebSocketMetrics();
	});

	it("tracks message receive/send/error and sizes", () => {
		metrics.messageReceived("subscribe", 128);
		metrics.messageSent("quote", 512);
		metrics.messageError("invalid_json");
		expect(
			metrics.registry.metrics.get(WS_METRICS.MESSAGES_RECEIVED)?.values.get('type="subscribe"'),
		).toBe(1);
		expect(metrics.registry.metrics.get(WS_METRICS.MESSAGES_SENT)?.values.get('type="quote"')).toBe(
			1,
		);
		expect(
			metrics.registry.metrics.get(WS_METRICS.MESSAGE_ERRORS)?.values.get('reason="invalid_json"'),
		).toBe(1);
		expect(metrics.registry.metrics.get(WS_METRICS.MESSAGE_SIZE_RECEIVED)?.type).toBe("histogram");
		expect(metrics.registry.metrics.get(WS_METRICS.MESSAGE_SIZE_SENT)?.type).toBe("histogram");
	});

	it("tracks broadcast, roundtrip, and heartbeat latency", () => {
		metrics.observeBroadcastLatency(15.5);
		metrics.observeRoundtripLatency(25.0);
		metrics.observeHeartbeatLatency(5.2);
		expect(metrics.registry.metrics.get(WS_METRICS.BROADCAST_LATENCY)?.type).toBe("histogram");
		expect(metrics.registry.metrics.get(WS_METRICS.ROUNDTRIP_LATENCY)?.type).toBe("histogram");
		expect(metrics.registry.metrics.get(WS_METRICS.HEARTBEAT_LATENCY)?.type).toBe("histogram");
	});
});

describe("createWebSocketMetrics - subscriptions and limits", () => {
	let metrics: WebSocketMetrics;

	beforeEach(() => {
		metrics = createWebSocketMetrics();
	});

	it("tracks subscription gauges", () => {
		metrics.updateChannelSubscriptions(5);
		metrics.updateSymbolSubscriptions(10);
		expect(metrics.registry.metrics.get(WS_METRICS.SUBSCRIBED_CHANNELS)?.values.get("")).toBe(5);
		expect(metrics.registry.metrics.get(WS_METRICS.SUBSCRIBED_SYMBOLS)?.values.get("")).toBe(10);
	});

	it("tracks rate limit and quote batching metrics", () => {
		metrics.rateLimitViolation("messages_per_second");
		metrics.observeQuoteBatchSize(50);
		metrics.observeQuoteThrottleDiscards("AAPL", 5);
		metrics.heartbeatTimeout();
		expect(
			metrics.registry.metrics
				.get(WS_METRICS.RATE_LIMIT_VIOLATIONS)
				?.values.get('reason="messages_per_second"'),
		).toBe(1);
		expect(metrics.registry.metrics.get(WS_METRICS.QUOTE_BATCH_SIZE)?.type).toBe("histogram");
		expect(
			metrics.registry.metrics.get(WS_METRICS.QUOTE_THROTTLE_DISCARDS)?.values.get('symbol="AAPL"'),
		).toBe(5);
		expect(metrics.registry.metrics.get(WS_METRICS.HEARTBEAT_TIMEOUTS)?.values.get("")).toBe(1);
	});
});

describe("createWebSocketMetrics - output", () => {
	it("exports Prometheus format output", () => {
		const metrics = createWebSocketMetrics();
		metrics.connectionOpened();
		metrics.messageReceived("subscribe", 128);
		const output = metrics.toPrometheus();
		expect(output).toContain("# HELP");
		expect(output).toContain("# TYPE");
	});
});

describe("Type checks", () => {
	it("supports MetricType and Labels", () => {
		const metricTypes: MetricType[] = ["counter", "gauge", "histogram"];
		const labels: Labels = { key: "value", another: "test" };
		expect(metricTypes).toHaveLength(3);
		expect(labels.key).toBe("value");
	});

	it("supports HistogramBuckets, Metric, and MetricOutput", () => {
		const buckets: HistogramBuckets = {
			boundaries: [10, 50, 100],
			counts: [0, 0, 0, 0],
			sum: 0,
			count: 0,
		};
		const metric: Metric = {
			name: "test_metric",
			type: "counter",
			help: "Test metric",
			values: new Map(),
		};
		const output: MetricOutput = {
			name: "test_metric",
			type: "counter",
			help: "Test metric",
			samples: [{ labels: {}, value: 1 }],
		};
		expect(buckets.boundaries).toBeDefined();
		expect(metric.values).toBeDefined();
		expect(output.samples).toBeDefined();
	});
});

describe("Module Exports", () => {
	it("exports public API", async () => {
		const module = await import("./metrics");
		expect(typeof module.createMetricsRegistry).toBe("function");
		expect(typeof module.createWebSocketMetrics).toBe("function");
		expect(module.default).toBe(module.createWebSocketMetrics);
		for (const fn of [
			"labelsToKey",
			"formatLabels",
			"createHistogramBuckets",
			"observeHistogram",
		] as const) {
			expect(typeof module[fn]).toBe("function");
		}
		expect(module.LATENCY_BUCKETS).toBeDefined();
		expect(module.SIZE_BUCKETS).toBeDefined();
		expect(module.DURATION_BUCKETS).toBeDefined();
		expect(module.WS_METRICS).toBeDefined();
		expect(module.METRIC_HELP).toBeDefined();
	});
});

describe("Integration - connection lifecycle", () => {
	it("tracks end-to-end connection and message metrics", () => {
		const metrics = createWebSocketMetrics();
		metrics.connectionOpened("user-123");
		expect(metrics.getActiveConnections()).toBe(1);
		metrics.messageReceived("subscribe", 64);
		metrics.messageSent("quote", 256);
		metrics.messageSent("quote", 512);
		metrics.observeHeartbeatLatency(5);
		metrics.observeHeartbeatLatency(7);
		metrics.connectionClosed(300, "user-123");
		expect(metrics.getActiveConnections()).toBe(0);
		const output = metrics.toPrometheus();
		expect(output).toContain("ws_active_connections");
		expect(output).toContain("ws_connections_total");
		expect(output).toContain("ws_messages_received_total");
		expect(output).toContain("ws_messages_sent_total");
		expect(output).toContain("ws_heartbeat_latency_ms");
		expect(output).toContain("ws_connection_duration_seconds");
	});
});

describe("Integration - labels and histogram buckets", () => {
	it("tracks multiple users and cumulative histogram output", () => {
		const metrics = createWebSocketMetrics();
		metrics.connectionOpened("user-a");
		metrics.connectionOpened("user-b");
		metrics.connectionOpened("user-a");
		expect(metrics.getActiveConnections()).toBe(3);
		const counter = metrics.registry.metrics.get(WS_METRICS.TOTAL_CONNECTIONS);
		expect(counter?.values.get('user_id="user-a"')).toBe(2);
		expect(counter?.values.get('user_id="user-b"')).toBe(1);
		metrics.observeBroadcastLatency(5);
		metrics.observeBroadcastLatency(15);
		metrics.observeBroadcastLatency(100);
		metrics.observeBroadcastLatency(500);
		const output = metrics.toPrometheus();
		expect(output).toContain("ws_broadcast_latency_ms_bucket");
		expect(output).toContain("ws_broadcast_latency_ms_sum 620");
		expect(output).toContain("ws_broadcast_latency_ms_count 4");
	});
});
