/**
 * Backtest Detail Page Types
 *
 * TypeScript interfaces and types for the backtest detail components.
 */

import type { BacktestStatus as ApiBacktestStatus } from "@/lib/api/types";

export type { BacktestStatus } from "@/lib/api/types";

export interface MonthlyReturn {
  month: string;
  returnPct: number;
}

export interface MetricCardProps {
  label: string;
  value: string;
  valueColor?: string;
}

export interface BacktestHeaderProps {
  name: string;
  startDate: string;
  endDate: string;
  status: ApiBacktestStatus;
  onExportCSV: () => void;
  onDelete: () => void;
  deleteConfirm: boolean;
  deleteDisabled: boolean;
  exportDisabled: boolean;
}

export interface BacktestProgressSectionProps {
  progressPct: number;
  barsProcessed?: number;
  totalBars?: number;
}

export interface BacktestParametersProps {
  initialCapital: number;
  startDate: string;
  endDate: string;
  finalNav: number | null;
  totalTrades: number | null;
}

export interface BacktestMetricsGridProps {
  totalReturnPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
}

export interface BestWorstTradesProps {
  bestTrade: { symbol: string; pnl: number };
  worstTrade: { symbol: string; pnl: number };
}

export interface BenchmarkComparisonProps {
  totalReturnPct: number;
}
