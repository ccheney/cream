/**
 * WebSocket Metrics Collection
 *
 * Prometheus-compatible metrics for WebSocket monitoring.
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/ui/08-realtime.md lines 130-139
 */

export type MetricType = "counter" | "gauge" | "histogram";

export type Labels = Record<string, string>;

export interface HistogramBuckets {
  boundaries: number[];
  counts: number[];
  sum: number;
  count: number;
}

export type MetricValue = number | HistogramBuckets;

export interface Metric {
  name: string;
  type: MetricType;
  help: string;
  values: Map<string, MetricValue>;
}

export interface MetricsRegistry {
  metrics: Map<string, Metric>;

  inc(name: string, labels?: Labels, value?: number): void;

  set(name: string, value: number, labels?: Labels): void;
  incGauge(name: string, labels?: Labels, value?: number): void;
  decGauge(name: string, labels?: Labels, value?: number): void;

  observe(name: string, value: number, labels?: Labels): void;

  getMetrics(): MetricOutput[];
  toPrometheus(): string;
  reset(): void;
}

export interface MetricOutput {
  name: string;
  type: MetricType;
  help: string;
  samples: Array<{ labels: Labels; value: number }>;
}

/** Default histogram buckets for latency (milliseconds). */
export const LATENCY_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/** Default histogram buckets for message size (bytes). */
export const SIZE_BUCKETS = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];

/** Default histogram buckets for duration (seconds). */
export const DURATION_BUCKETS = [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600];

export const WS_METRICS = {
  ACTIVE_CONNECTIONS: "ws_active_connections",
  TOTAL_CONNECTIONS: "ws_connections_total",
  CONNECTION_DURATION: "ws_connection_duration_seconds",
  CONNECTION_ERRORS: "ws_connection_errors_total",

  MESSAGES_RECEIVED: "ws_messages_received_total",
  MESSAGES_SENT: "ws_messages_sent_total",
  MESSAGE_SIZE_RECEIVED: "ws_message_size_received_bytes",
  MESSAGE_SIZE_SENT: "ws_message_size_sent_bytes",
  MESSAGE_ERRORS: "ws_message_errors_total",

  BROADCAST_LATENCY: "ws_broadcast_latency_ms",
  ROUNDTRIP_LATENCY: "ws_roundtrip_latency_ms",

  SUBSCRIBED_CHANNELS: "ws_subscribed_channels",
  SUBSCRIBED_SYMBOLS: "ws_subscribed_symbols",

  RATE_LIMIT_VIOLATIONS: "ws_rate_limit_violations_total",

  QUOTE_BATCH_SIZE: "ws_quote_batch_size",
  QUOTE_THROTTLE_DISCARDS: "ws_quote_throttle_discards",

  HEARTBEAT_LATENCY: "ws_heartbeat_latency_ms",
  HEARTBEAT_TIMEOUTS: "ws_heartbeat_timeouts_total",
} as const;

export const METRIC_HELP: Record<string, string> = {
  [WS_METRICS.ACTIVE_CONNECTIONS]: "Number of currently active WebSocket connections",
  [WS_METRICS.TOTAL_CONNECTIONS]: "Total number of WebSocket connections since startup",
  [WS_METRICS.CONNECTION_DURATION]: "Duration of WebSocket connections in seconds",
  [WS_METRICS.CONNECTION_ERRORS]: "Total number of connection errors",
  [WS_METRICS.MESSAGES_RECEIVED]: "Total messages received from clients",
  [WS_METRICS.MESSAGES_SENT]: "Total messages sent to clients",
  [WS_METRICS.MESSAGE_SIZE_RECEIVED]: "Size of messages received in bytes",
  [WS_METRICS.MESSAGE_SIZE_SENT]: "Size of messages sent in bytes",
  [WS_METRICS.MESSAGE_ERRORS]: "Total message processing errors",
  [WS_METRICS.BROADCAST_LATENCY]: "Time to broadcast a message in milliseconds",
  [WS_METRICS.ROUNDTRIP_LATENCY]: "Client roundtrip latency in milliseconds",
  [WS_METRICS.SUBSCRIBED_CHANNELS]: "Number of channel subscriptions per connection",
  [WS_METRICS.SUBSCRIBED_SYMBOLS]: "Number of symbol subscriptions per connection",
  [WS_METRICS.RATE_LIMIT_VIOLATIONS]: "Total rate limit violations",
  [WS_METRICS.QUOTE_BATCH_SIZE]: "Number of quotes per batch",
  [WS_METRICS.QUOTE_THROTTLE_DISCARDS]: "Quotes discarded due to throttling",
  [WS_METRICS.HEARTBEAT_LATENCY]: "Heartbeat roundtrip latency in milliseconds",
  [WS_METRICS.HEARTBEAT_TIMEOUTS]: "Total heartbeat timeouts",
};

export function labelsToKey(labels: Labels = {}): string {
  const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([k, v]) => `${k}="${v}"`).join(",");
}

export function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  const formatted = entries.map(([k, v]) => `${k}="${v}"`).join(",");
  return `{${formatted}}`;
}

export function createHistogramBuckets(boundaries: number[]): HistogramBuckets {
  return {
    boundaries: [...boundaries],
    counts: new Array(boundaries.length + 1).fill(0),
    sum: 0,
    count: 0,
  };
}

export function observeHistogram(histogram: HistogramBuckets, value: number): void {
  histogram.sum += value;
  histogram.count += 1;

  for (let i = 0; i < histogram.boundaries.length; i++) {
    const boundary = histogram.boundaries[i];
    if (boundary !== undefined && value <= boundary) {
      const count = histogram.counts[i];
      if (count !== undefined) {
        histogram.counts[i] = count + 1;
      }
      return;
    }
  }
  const lastIndex = histogram.counts.length - 1;
  const lastCount = histogram.counts[lastIndex];
  if (lastCount !== undefined) {
    histogram.counts[lastIndex] = lastCount + 1;
  }
}

/**
 * @example
 * ```ts
 * const registry = createMetricsRegistry();
 *
 * registry.inc(WS_METRICS.TOTAL_CONNECTIONS);
 * registry.set(WS_METRICS.ACTIVE_CONNECTIONS, 42);
 * registry.observe(WS_METRICS.BROADCAST_LATENCY, 15.5);
 *
 * console.log(registry.toPrometheus());
 * ```
 */
export function createMetricsRegistry(): MetricsRegistry {
  const metrics = new Map<string, Metric>();

  const ensureMetric = (name: string, type: MetricType, _buckets?: number[]): Metric => {
    let metric = metrics.get(name);
    if (!metric) {
      metric = {
        name,
        type,
        help: METRIC_HELP[name] || name,
        values: new Map(),
      };
      metrics.set(name, metric);
    }
    return metric;
  };

  return {
    metrics,

    inc(name: string, labels: Labels = {}, value = 1): void {
      const metric = ensureMetric(name, "counter");
      const key = labelsToKey(labels);
      const current = (metric.values.get(key) as number) || 0;
      metric.values.set(key, current + value);
    },

    set(name: string, value: number, labels: Labels = {}): void {
      const metric = ensureMetric(name, "gauge");
      const key = labelsToKey(labels);
      metric.values.set(key, value);
    },

    incGauge(name: string, labels: Labels = {}, value = 1): void {
      const metric = ensureMetric(name, "gauge");
      const key = labelsToKey(labels);
      const current = (metric.values.get(key) as number) || 0;
      metric.values.set(key, current + value);
    },

    decGauge(name: string, labels: Labels = {}, value = 1): void {
      const metric = ensureMetric(name, "gauge");
      const key = labelsToKey(labels);
      const current = (metric.values.get(key) as number) || 0;
      metric.values.set(key, current - value);
    },

    observe(name: string, value: number, labels: Labels = {}): void {
      const metric = ensureMetric(name, "histogram");
      const key = labelsToKey(labels);
      let histogram = metric.values.get(key) as HistogramBuckets | undefined;
      if (!histogram) {
        const buckets =
          name.includes("latency") || name.includes("ms")
            ? LATENCY_BUCKETS
            : name.includes("size") || name.includes("bytes")
              ? SIZE_BUCKETS
              : name.includes("duration") || name.includes("seconds")
                ? DURATION_BUCKETS
                : LATENCY_BUCKETS;
        histogram = createHistogramBuckets(buckets);
        metric.values.set(key, histogram);
      }
      observeHistogram(histogram, value);
    },

    getMetrics(): MetricOutput[] {
      const outputs: MetricOutput[] = [];

      for (const [name, metric] of metrics) {
        const samples: Array<{ labels: Labels; value: number }> = [];

        if (metric.type === "histogram") {
          for (const [labelKey, histogram] of metric.values) {
            const baseLabels: Labels = {};
            if (labelKey) {
              for (const pair of labelKey.split(",")) {
                const [k, v] = pair.split("=");
                if (k && v) {
                  baseLabels[k] = v.replace(/"/g, "");
                }
              }
            }

            const buckets = histogram as HistogramBuckets;
            let cumulative = 0;
            for (let i = 0; i < buckets.boundaries.length; i++) {
              const count = buckets.counts[i];
              const boundary = buckets.boundaries[i];
              if (count !== undefined && boundary !== undefined) {
                cumulative += count;
                samples.push({
                  labels: { ...baseLabels, le: String(boundary) },
                  value: cumulative,
                });
              }
            }
            const lastCount = buckets.counts[buckets.counts.length - 1];
            if (lastCount !== undefined) {
              cumulative += lastCount;
            }
            samples.push({
              labels: { ...baseLabels, le: "+Inf" },
              value: cumulative,
            });
          }
        } else {
          for (const [labelKey, value] of metric.values) {
            const labels: Labels = {};
            if (labelKey) {
              for (const pair of labelKey.split(",")) {
                const [k, v] = pair.split("=");
                if (k && v) {
                  labels[k] = v.replace(/"/g, "");
                }
              }
            }
            samples.push({ labels, value: value as number });
          }
        }

        outputs.push({
          name,
          type: metric.type,
          help: metric.help,
          samples,
        });
      }

      return outputs;
    },

    toPrometheus(): string {
      const lines: string[] = [];

      for (const [name, metric] of metrics) {
        lines.push(`# HELP ${name} ${metric.help}`);
        lines.push(`# TYPE ${name} ${metric.type}`);

        if (metric.type === "histogram") {
          for (const [labelKey, histogram] of metric.values) {
            const buckets = histogram as HistogramBuckets;
            let cumulative = 0;

            for (let i = 0; i < buckets.boundaries.length; i++) {
              const count = buckets.counts[i];
              const le = buckets.boundaries[i];
              if (count !== undefined && le !== undefined) {
                cumulative += count;
                const labels = labelKey ? `{${labelKey},le="${le}"}` : `{le="${le}"}`;
                lines.push(`${name}_bucket${labels} ${cumulative}`);
              }
            }

            const lastCount = buckets.counts[buckets.counts.length - 1];
            if (lastCount !== undefined) {
              cumulative += lastCount;
            }
            const infLabels = labelKey ? `{${labelKey},le="+Inf"}` : `{le="+Inf"}`;
            lines.push(`${name}_bucket${infLabels} ${cumulative}`);

            const sumLabels = labelKey ? `{${labelKey}}` : "";
            lines.push(`${name}_sum${sumLabels} ${buckets.sum}`);
            lines.push(`${name}_count${sumLabels} ${buckets.count}`);
          }
        } else {
          for (const [labelKey, value] of metric.values) {
            const labels = labelKey ? `{${labelKey}}` : "";
            lines.push(`${name}${labels} ${value}`);
          }
        }

        lines.push("");
      }

      return lines.join("\n");
    },

    reset(): void {
      metrics.clear();
    },
  };
}

export interface WebSocketMetrics {
  registry: MetricsRegistry;

  connectionOpened(userId?: string): void;
  connectionClosed(durationSeconds: number, userId?: string): void;
  connectionError(reason: string): void;

  messageReceived(type: string, sizeBytes: number): void;
  messageSent(type: string, sizeBytes: number): void;
  messageError(reason: string): void;

  observeBroadcastLatency(latencyMs: number): void;
  observeRoundtripLatency(latencyMs: number): void;

  updateChannelSubscriptions(count: number): void;
  updateSymbolSubscriptions(count: number): void;

  rateLimitViolation(reason: string): void;

  observeQuoteBatchSize(size: number): void;
  observeQuoteThrottleDiscards(symbol: string, count: number): void;

  observeHeartbeatLatency(latencyMs: number): void;
  heartbeatTimeout(): void;

  toPrometheus(): string;
  getActiveConnections(): number;
}

export function createWebSocketMetrics(): WebSocketMetrics {
  const registry = createMetricsRegistry();
  let activeConnections = 0;

  return {
    registry,

    connectionOpened(userId?: string) {
      activeConnections += 1;
      registry.set(WS_METRICS.ACTIVE_CONNECTIONS, activeConnections);
      registry.inc(WS_METRICS.TOTAL_CONNECTIONS, userId ? { user_id: userId } : {});
    },

    connectionClosed(durationSeconds: number, _userId?: string) {
      activeConnections = Math.max(0, activeConnections - 1);
      registry.set(WS_METRICS.ACTIVE_CONNECTIONS, activeConnections);
      registry.observe(WS_METRICS.CONNECTION_DURATION, durationSeconds);
    },

    connectionError(reason: string) {
      registry.inc(WS_METRICS.CONNECTION_ERRORS, { reason });
    },

    messageReceived(type: string, sizeBytes: number) {
      registry.inc(WS_METRICS.MESSAGES_RECEIVED, { type });
      registry.observe(WS_METRICS.MESSAGE_SIZE_RECEIVED, sizeBytes, { type });
    },

    messageSent(type: string, sizeBytes: number) {
      registry.inc(WS_METRICS.MESSAGES_SENT, { type });
      registry.observe(WS_METRICS.MESSAGE_SIZE_SENT, sizeBytes, { type });
    },

    messageError(reason: string) {
      registry.inc(WS_METRICS.MESSAGE_ERRORS, { reason });
    },

    observeBroadcastLatency(latencyMs: number) {
      registry.observe(WS_METRICS.BROADCAST_LATENCY, latencyMs);
    },

    observeRoundtripLatency(latencyMs: number) {
      registry.observe(WS_METRICS.ROUNDTRIP_LATENCY, latencyMs);
    },

    updateChannelSubscriptions(count: number) {
      registry.set(WS_METRICS.SUBSCRIBED_CHANNELS, count);
    },

    updateSymbolSubscriptions(count: number) {
      registry.set(WS_METRICS.SUBSCRIBED_SYMBOLS, count);
    },

    rateLimitViolation(reason: string) {
      registry.inc(WS_METRICS.RATE_LIMIT_VIOLATIONS, { reason });
    },

    observeQuoteBatchSize(size: number) {
      registry.observe(WS_METRICS.QUOTE_BATCH_SIZE, size);
    },

    observeQuoteThrottleDiscards(symbol: string, count: number) {
      registry.inc(WS_METRICS.QUOTE_THROTTLE_DISCARDS, { symbol }, count);
    },

    observeHeartbeatLatency(latencyMs: number) {
      registry.observe(WS_METRICS.HEARTBEAT_LATENCY, latencyMs);
    },

    heartbeatTimeout() {
      registry.inc(WS_METRICS.HEARTBEAT_TIMEOUTS);
    },

    toPrometheus() {
      return registry.toPrometheus();
    },

    getActiveConnections() {
      return activeConnections;
    },
  };
}

export default createWebSocketMetrics;
