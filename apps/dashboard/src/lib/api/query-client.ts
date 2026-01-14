/**
 * TanStack Query Client Configuration
 *
 * Centralized query client with:
 * - Cache duration strategies per data type
 * - Error handling
 * - WebSocket invalidation integration
 *
 * @see docs/plans/ui/07-state-management.md
 * @see docs/plans/ui/08-realtime.md
 */

import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

// ============================================
// Cache Duration Constants
// ============================================

/**
 * Cache durations per data type.
 * @see docs/plans/ui/08-realtime.md lines 96-105
 */
export const CACHE_TIMES = {
  /** Static config - 1 hour */
  STATIC: 1000 * 60 * 60,
  /** Config data - 5 minutes */
  CONFIG: 1000 * 60 * 5,
  /** Market data - 1 second */
  MARKET: 1000,
  /** Portfolio data - 5 seconds */
  PORTFOLIO: 1000 * 5,
  /** Decisions - 30 seconds */
  DECISIONS: 1000 * 30,
  /** Historical data - 5 minutes */
  HISTORICAL: 1000 * 60 * 5,
  /** Chart data - 1 minute */
  CHART: 1000 * 60,
  /** Default - 30 seconds */
  DEFAULT: 1000 * 30,
} as const;

/**
 * Stale times (when to background refetch).
 */
export const STALE_TIMES = {
  /** Static config - 30 minutes */
  STATIC: 1000 * 60 * 30,
  /** Config data - 2 minutes */
  CONFIG: 1000 * 60 * 2,
  /** Market data - instant (always stale) */
  MARKET: 0,
  /** Portfolio data - 2 seconds */
  PORTFOLIO: 1000 * 2,
  /** Decisions - 10 seconds */
  DECISIONS: 1000 * 10,
  /** Historical data - 2 minutes */
  HISTORICAL: 1000 * 60 * 2,
  /** Chart data - 30 seconds */
  CHART: 1000 * 30,
  /** Default - 10 seconds */
  DEFAULT: 1000 * 10,
} as const;

// ============================================
// Query Key Factory
// ============================================

/**
 * Centralized query key factory.
 * Ensures consistent key structure across the application.
 *
 * @example
 * ```typescript
 * queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all })
 * queryClient.invalidateQueries({ queryKey: queryKeys.decisions.list() })
 * ```
 */
export const queryKeys = {
  // Calendar
  calendar: {
    all: ["calendar"] as const,
    clock: () => [...queryKeys.calendar.all, "clock"] as const,
    status: () => [...queryKeys.calendar.all, "status"] as const,
    range: (start: string, end: string) => [...queryKeys.calendar.all, start, end] as const,
  },

  // Economic Calendar
  economicCalendar: {
    all: ["economic-calendar"] as const,
    events: (start: string, end: string, impact?: string) =>
      [...queryKeys.economicCalendar.all, start, end, impact] as const,
    event: (id: string) => [...queryKeys.economicCalendar.all, id] as const,
    history: (id: string) => [...queryKeys.economicCalendar.all, id, "history"] as const,
  },

  // System
  system: {
    all: ["system"] as const,
    status: () => [...queryKeys.system.all, "status"] as const,
    config: () => [...queryKeys.system.all, "config"] as const,
  },

  // Decisions
  decisions: {
    all: ["decisions"] as const,
    list: (filters?: object) =>
      filters
        ? ([...queryKeys.decisions.all, filters] as const)
        : ([...queryKeys.decisions.all] as const),
    detail: (id: string) => [...queryKeys.decisions.all, id] as const,
  },

  // Portfolio
  portfolio: {
    all: ["portfolio"] as const,
    summary: () => [...queryKeys.portfolio.all, "summary"] as const,
    account: () => [...queryKeys.portfolio.all, "account"] as const,
    history: (period: string) => [...queryKeys.portfolio.all, "history", period] as const,
    positions: () => [...queryKeys.portfolio.all, "positions"] as const,
    position: (id: string) => [...queryKeys.portfolio.all, "positions", id] as const,
  },

  // Risk
  risk: {
    all: ["risk"] as const,
    exposure: () => [...queryKeys.risk.all, "exposure"] as const,
    greeks: () => [...queryKeys.risk.all, "greeks"] as const,
  },

  // Market
  market: {
    all: ["market"] as const,
    symbol: (symbol: string) => [...queryKeys.market.all, symbol] as const,
    quote: (symbol: string) => [...queryKeys.market.all, symbol, "quote"] as const,
    candles: (symbol: string, timeframe: string) =>
      [...queryKeys.market.all, symbol, "candles", timeframe] as const,
    snapshot: (symbol: string) => [...queryKeys.market.all, symbol, "snapshot"] as const,
  },

  // Options
  options: {
    all: ["options"] as const,
    chain: (underlying: string, expiration?: string) =>
      expiration
        ? ([...queryKeys.options.all, underlying, "chain", expiration] as const)
        : ([...queryKeys.options.all, underlying, "chain"] as const),
    expirations: (underlying: string) =>
      [...queryKeys.options.all, underlying, "expirations"] as const,
    quote: (contract: string) => [...queryKeys.options.all, "quote", contract] as const,
  },

  // Config
  config: {
    all: ["config"] as const,
    section: (section: string) => [...queryKeys.config.all, section] as const,
  },

  // Agents
  agents: {
    all: ["agents"] as const,
    list: () => [...queryKeys.agents.all] as const,
    status: (type: string) => [...queryKeys.agents.all, type, "status"] as const,
  },

  // Alerts
  alerts: {
    all: ["alerts"] as const,
    list: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.alerts.all, filters] as const)
        : ([...queryKeys.alerts.all] as const),
    unread: () => [...queryKeys.alerts.all, "unread"] as const,
  },

  // Backtests
  backtests: {
    all: ["backtests"] as const,
    list: () => [...queryKeys.backtests.all] as const,
    detail: (id: string) => [...queryKeys.backtests.all, id] as const,
    trades: (id: string) => [...queryKeys.backtests.all, id, "trades"] as const,
    equity: (id: string) => [...queryKeys.backtests.all, id, "equity"] as const,
  },

  // Theses
  theses: {
    all: ["theses"] as const,
    list: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.theses.all, filters] as const)
        : ([...queryKeys.theses.all] as const),
    detail: (id: string) => [...queryKeys.theses.all, id] as const,
  },

  // Cycles
  cycles: {
    all: ["cycles"] as const,
    list: (filters?: Record<string, unknown>) =>
      filters
        ? ([...queryKeys.cycles.all, "list", filters] as const)
        : ([...queryKeys.cycles.all, "list"] as const),
    full: (id: string) => [...queryKeys.cycles.all, id, "full"] as const,
  },
} as const;

// ============================================
// Query Client Configuration
// ============================================

const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.DEFAULT,
      gcTime: CACHE_TIMES.DEFAULT,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx or 503 errors (503 often means invalid symbol from market data provider)
        if (error && typeof error === "object" && "status" in error) {
          const status = (error as { status: number }).status;
          if ((status >= 400 && status < 500) || status === 503) {
            return false;
          }
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
};

// ============================================
// Query Client Instance
// ============================================

let queryClient: QueryClient | null = null;

/**
 * Get or create the query client singleton.
 *
 * Uses a singleton pattern to ensure the same client is used
 * across the application and for WebSocket invalidation.
 */
export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient(queryClientConfig);
  }
  return queryClient;
}

/**
 * Reset the query client (for testing).
 */
export function resetQueryClient(): void {
  queryClient?.clear();
  queryClient = null;
}

export default getQueryClient;
