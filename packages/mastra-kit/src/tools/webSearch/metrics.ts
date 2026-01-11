/**
 * Web Search Metrics
 *
 * Metrics collection and reporting for web search operations.
 */

export interface RequestCount {
  total: number;
  successful: number;
  cached: number;
}

export interface WebSearchMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  rateLimitedRequests: number;

  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  averageResultCount: number;
  emptyResultCount: number;

  apiCallsUsed: number;

  lastHour: RequestCount;
  lastDay: RequestCount;
}

export interface RequestRecord {
  timestamp: number;
  type: "success" | "cache_hit" | "rate_limited" | "error" | "backtest";
  latencyMs: number;
  resultCount: number;
}

class MetricsCollector {
  private requests: RequestRecord[] = [];
  private readonly maxRecords = 10000;

  record(record: RequestRecord): void {
    this.requests.push(record);

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.requests = this.requests.filter((r) => r.timestamp > cutoff);

    if (this.requests.length > this.maxRecords) {
      this.requests = this.requests.slice(-this.maxRecords);
    }
  }

  getMetrics(): WebSearchMetrics {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const lastHourRequests = this.requests.filter((r) => r.timestamp > oneHourAgo);
    const lastDayRequests = this.requests.filter((r) => r.timestamp > oneDayAgo);

    const successRequests = lastDayRequests.filter((r) => r.type === "success");
    const cacheHits = lastDayRequests.filter((r) => r.type === "cache_hit");
    const rateLimited = lastDayRequests.filter((r) => r.type === "rate_limited");
    const errors = lastDayRequests.filter((r) => r.type === "error");

    const latencies = successRequests.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    const resultCounts = lastDayRequests.map((r) => r.resultCount);
    const avgResults =
      resultCounts.length > 0 ? resultCounts.reduce((a, b) => a + b, 0) / resultCounts.length : 0;

    const emptyResults = lastDayRequests.filter((r) => r.resultCount === 0).length;

    const lastHourStats = this.aggregateWindow(lastHourRequests);
    const lastDayStats = this.aggregateWindow(lastDayRequests);

    return {
      totalRequests: lastDayRequests.length,
      successfulRequests: successRequests.length,
      failedRequests: errors.length,
      cacheHits: cacheHits.length,
      rateLimitedRequests: rateLimited.length,

      averageLatencyMs: Math.round(avgLatency),
      p95LatencyMs: latencies[p95Index] ?? 0,
      p99LatencyMs: latencies[p99Index] ?? 0,

      averageResultCount: Math.round(avgResults * 10) / 10,
      emptyResultCount: emptyResults,

      apiCallsUsed: successRequests.length,

      lastHour: lastHourStats,
      lastDay: lastDayStats,
    };
  }

  reset(): void {
    this.requests = [];
  }

  getRecordCount(): number {
    return this.requests.length;
  }

  private aggregateWindow(requests: RequestRecord[]): RequestCount {
    return {
      total: requests.length,
      successful: requests.filter((r) => r.type === "success").length,
      cached: requests.filter((r) => r.type === "cache_hit").length,
    };
  }
}

export const metricsCollector = new MetricsCollector();

export function getWebSearchMetrics(): WebSearchMetrics {
  return metricsCollector.getMetrics();
}
