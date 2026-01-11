/**
 * Chart Page Types
 *
 * TypeScript interfaces and types for the chart page components.
 */

import type { ChartTimeframe } from "@/stores/ui-store";

export const TIMEFRAME_OPTIONS: ChartTimeframe[] = ["1m", "5m", "15m"];

export const MA_OPTIONS = ["sma20", "sma50", "sma200", "ema12", "ema26"] as const;

export type MAOption = (typeof MA_OPTIONS)[number];

export const CANDLE_LIMITS: Record<ChartTimeframe, number> = {
  "1m": 500,
  "5m": 300,
  "15m": 100,
};

export interface ChartPageProps {
  params: Promise<{ symbol: string }>;
}

export interface ChartContentProps {
  symbol: string;
}

export interface ChartHeaderProps {
  symbol: string;
  companyName: string | undefined;
  timeframe: ChartTimeframe;
  onTimeframeChange: (tf: ChartTimeframe) => void;
  isStreamOpen: boolean;
  onStreamToggle: () => void;
}

export interface ChartControlsProps {
  enabledMAs: string[];
  onToggleMA: (maId: string) => void;
}

export type IndicatorStatus = "overbought" | "oversold" | "bullish" | "bearish" | "neutral";

export interface IndicatorCardProps {
  name: string;
  value: string;
  status?: IndicatorStatus;
  tooltip?: string;
  isLoading: boolean;
}

export interface MovingAveragesPanelProps {
  indicators: {
    sma20?: number | null;
    sma50?: number | null;
    sma200?: number | null;
    ema12?: number | null;
    ema26?: number | null;
    macdLine?: number | null;
  };
}
