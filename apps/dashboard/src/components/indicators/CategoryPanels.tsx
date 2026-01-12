/**
 * Category Panel Components
 *
 * Individual panels for each indicator category:
 * - Price indicators (RSI, ATR, SMAs, EMAs, MACD, Bollinger, Stochastic)
 * - Liquidity indicators (Bid-Ask Spread, Amihud, VWAP, Turnover)
 * - Options indicators (IV, Skew, P/C Ratio, VRP, Greeks)
 * - Value factors (P/E, P/B, EV/EBITDA, Dividend Yield)
 * - Quality factors (Gross Profitability, ROE, ROA, Accruals, M-Score)
 * - Short interest (Short %, Days to Cover)
 * - Sentiment (Score, Classification, News Volume)
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

"use client";

import {
  Activity,
  BarChart3,
  Building2,
  Droplets,
  LineChart,
  MessageSquare,
  Shield,
  TrendingDown,
} from "lucide-react";
import type {
  CorporateIndicators,
  LiquidityIndicators,
  OptionsIndicators,
  PriceIndicators,
  QualityIndicators,
  SentimentClassification,
  SentimentIndicators,
  ShortInterestIndicators,
  ValueIndicators,
} from "@/lib/api/types";
import { IndicatorGrid } from "./IndicatorGrid";
import { type Freshness, IndicatorSection } from "./IndicatorSection";
import { IndicatorValue, type IndicatorValueProps } from "./IndicatorValue";

// ============================================
// Helper Functions
// ============================================

function getRsiStatus(rsi: number | null): IndicatorValueProps["status"] {
  if (rsi === null) {
    return undefined;
  }
  if (rsi >= 70) {
    return "negative"; // Overbought
  }
  if (rsi <= 30) {
    return "positive"; // Oversold
  }
  return undefined;
}

function getMacdStatus(histogram: number | null): IndicatorValueProps["status"] {
  if (histogram === null) {
    return undefined;
  }
  if (histogram > 0) {
    return "positive";
  }
  if (histogram < 0) {
    return "negative";
  }
  return undefined;
}

function getSentimentStatus(score: number | null): IndicatorValueProps["status"] {
  if (score === null) {
    return undefined;
  }
  if (score > 0.2) {
    return "positive";
  }
  if (score < -0.2) {
    return "negative";
  }
  return "neutral";
}

function getShortInterestStatus(shortPct: number | null): IndicatorValueProps["status"] {
  if (shortPct === null) {
    return undefined;
  }
  if (shortPct > 0.2) {
    return "warning"; // > 20% short
  }
  if (shortPct > 0.1) {
    return "neutral"; // > 10% short
  }
  return undefined;
}

function getMScoreStatus(mScore: number | null): IndicatorValueProps["status"] {
  if (mScore === null) {
    return undefined;
  }
  if (mScore < -2.22) {
    return "critical"; // High fraud risk
  }
  if (mScore < -1.78) {
    return "warning"; // Moderate risk
  }
  return undefined;
}

function getSentimentLabel(classification: SentimentClassification | null): string {
  if (!classification) {
    return "--";
  }
  switch (classification) {
    case "STRONG_BULLISH":
      return "Strong Bullish";
    case "BULLISH":
      return "Bullish";
    case "NEUTRAL":
      return "Neutral";
    case "BEARISH":
      return "Bearish";
    case "STRONG_BEARISH":
      return "Strong Bearish";
    default:
      return "--";
  }
}

// ============================================
// Price Indicators Panel
// ============================================

export interface PriceIndicatorsPanelProps {
  data: PriceIndicators | null | undefined;
  isLoading?: boolean;
  freshness?: Freshness;
}

export function PriceIndicatorsPanel({
  data,
  isLoading,
  freshness = "recent",
}: PriceIndicatorsPanelProps) {
  return (
    <IndicatorSection
      title="Price Indicators"
      icon={<LineChart className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
    >
      <IndicatorGrid columns={6}>
        <IndicatorValue
          label="RSI(14)"
          value={data?.rsi_14}
          status={getRsiStatus(data?.rsi_14 ?? null)}
          tooltip="Relative Strength Index - >70 overbought, <30 oversold"
        />
        <IndicatorValue
          label="ATR(14)"
          value={data?.atr_14}
          tooltip="Average True Range - Volatility measure"
        />
        <IndicatorValue label="SMA(20)" value={data?.sma_20} />
        <IndicatorValue label="SMA(50)" value={data?.sma_50} />
        <IndicatorValue label="SMA(200)" value={data?.sma_200} />
        <IndicatorValue label="EMA(9)" value={data?.ema_9} />
        <IndicatorValue label="EMA(12)" value={data?.ema_12} />
        <IndicatorValue label="EMA(21)" value={data?.ema_21} />
        <IndicatorValue label="EMA(26)" value={data?.ema_26} />
        <IndicatorValue
          label="MACD"
          value={data?.macd_line}
          status={getMacdStatus(data?.macd_histogram ?? null)}
        />
        <IndicatorValue label="Signal" value={data?.macd_signal} />
        <IndicatorValue
          label="Histogram"
          value={data?.macd_histogram}
          status={getMacdStatus(data?.macd_histogram ?? null)}
        />
        <IndicatorValue
          label="BB Upper"
          value={data?.bollinger_upper}
          tooltip="Bollinger Band Upper (20, 2)"
        />
        <IndicatorValue label="BB Middle" value={data?.bollinger_middle} />
        <IndicatorValue label="BB Lower" value={data?.bollinger_lower} />
        <IndicatorValue
          label="BB %B"
          value={data?.bollinger_percentb}
          format="percent"
          tooltip="Price position within Bollinger Bands"
        />
        <IndicatorValue label="Stoch %K" value={data?.stochastic_k} />
        <IndicatorValue label="Stoch %D" value={data?.stochastic_d} />
        <IndicatorValue
          label="Mom 1M"
          value={data?.momentum_1m}
          format="percent"
          status={
            data?.momentum_1m && data.momentum_1m > 0
              ? "positive"
              : data?.momentum_1m && data.momentum_1m < 0
                ? "negative"
                : undefined
          }
        />
        <IndicatorValue
          label="Mom 3M"
          value={data?.momentum_3m}
          format="percent"
          status={
            data?.momentum_3m && data.momentum_3m > 0
              ? "positive"
              : data?.momentum_3m && data.momentum_3m < 0
                ? "negative"
                : undefined
          }
        />
        <IndicatorValue
          label="Vol 20D"
          value={data?.realized_vol_20d}
          format="percent"
          tooltip="Realized volatility (20-day)"
        />
      </IndicatorGrid>
    </IndicatorSection>
  );
}

// ============================================
// Liquidity Indicators Panel
// ============================================

export interface LiquidityIndicatorsPanelProps {
  data: LiquidityIndicators | null | undefined;
  isLoading?: boolean;
  freshness?: Freshness;
}

export function LiquidityIndicatorsPanel({
  data,
  isLoading,
  freshness = "recent",
}: LiquidityIndicatorsPanelProps) {
  return (
    <IndicatorSection
      title="Liquidity"
      icon={<Droplets className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
    >
      <IndicatorGrid columns={4}>
        <IndicatorValue
          label="Bid-Ask"
          value={data?.bid_ask_spread}
          format="currency"
          tooltip="Current bid-ask spread"
        />
        <IndicatorValue
          label="Spread %"
          value={data?.bid_ask_spread_pct}
          format="percent"
          decimals={3}
        />
        <IndicatorValue
          label="Amihud"
          value={data?.amihud_illiquidity}
          decimals={4}
          tooltip="Amihud illiquidity measure - higher = less liquid"
        />
        <IndicatorValue
          label="VWAP"
          value={data?.vwap}
          format="currency"
          tooltip="Volume-weighted average price"
        />
        <IndicatorValue
          label="Turnover"
          value={data?.turnover_ratio}
          format="percent"
          tooltip="Daily turnover as % of shares"
        />
        <IndicatorValue
          label="Vol Ratio"
          value={data?.volume_ratio}
          format="ratio"
          tooltip="Current volume vs average"
        />
      </IndicatorGrid>
    </IndicatorSection>
  );
}

// ============================================
// Options Indicators Panel
// ============================================

export interface OptionsIndicatorsPanelProps {
  data: OptionsIndicators | null | undefined;
  isLoading?: boolean;
  freshness?: Freshness;
}

export function OptionsIndicatorsPanel({
  data,
  isLoading,
  freshness = "recent",
}: OptionsIndicatorsPanelProps) {
  return (
    <IndicatorSection
      title="Options"
      icon={<Activity className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
    >
      <IndicatorGrid columns={5}>
        <IndicatorValue
          label="ATM IV"
          value={data?.atm_iv}
          format="percent"
          tooltip="At-the-money implied volatility"
        />
        <IndicatorValue
          label="IV Skew"
          value={data?.iv_skew_25d}
          format="percent"
          tooltip="25-delta put-call IV skew"
        />
        <IndicatorValue
          label="P/C Vol"
          value={data?.put_call_ratio_volume}
          format="ratio"
          tooltip="Put/Call volume ratio"
        />
        <IndicatorValue
          label="P/C OI"
          value={data?.put_call_ratio_oi}
          format="ratio"
          tooltip="Put/Call open interest ratio"
        />
        <IndicatorValue
          label="Term Slope"
          value={data?.term_structure_slope}
          format="percent"
          tooltip="Term structure slope (contango/backwardation)"
        />
        <IndicatorValue
          label="VRP"
          value={data?.vrp}
          format="percent"
          tooltip="Volatility risk premium (IV - RV)"
        />
        <IndicatorValue label="Net Delta" value={data?.net_delta} decimals={0} />
        <IndicatorValue label="Net Gamma" value={data?.net_gamma} decimals={0} />
        <IndicatorValue label="Net Theta" value={data?.net_theta} format="currency" />
        <IndicatorValue label="Net Vega" value={data?.net_vega} format="currency" />
      </IndicatorGrid>
    </IndicatorSection>
  );
}

// ============================================
// Value Factors Panel
// ============================================

export interface ValueIndicatorsPanelProps {
  data: ValueIndicators | null | undefined;
  isLoading?: boolean;
  freshness?: Freshness;
}

export function ValueIndicatorsPanel({
  data,
  isLoading,
  freshness = "stale",
}: ValueIndicatorsPanelProps) {
  return (
    <IndicatorSection
      title="Value Factors"
      icon={<BarChart3 className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
    >
      <IndicatorGrid columns={4}>
        <IndicatorValue
          label="P/E (TTM)"
          value={data?.pe_ratio_ttm}
          format="ratio"
          tooltip="Price-to-earnings (trailing 12 months)"
        />
        <IndicatorValue
          label="P/E (Fwd)"
          value={data?.pe_ratio_forward}
          format="ratio"
          tooltip="Forward price-to-earnings"
        />
        <IndicatorValue
          label="P/B"
          value={data?.pb_ratio}
          format="ratio"
          tooltip="Price-to-book ratio"
        />
        <IndicatorValue label="EV/EBITDA" value={data?.ev_ebitda} format="ratio" />
        <IndicatorValue
          label="Earn Yield"
          value={data?.earnings_yield}
          format="percent"
          tooltip="Earnings yield (E/P)"
        />
        <IndicatorValue label="Div Yield" value={data?.dividend_yield} format="percent" />
        <IndicatorValue
          label="CAPE"
          value={data?.cape_10yr}
          format="ratio"
          tooltip="Cyclically-adjusted P/E (10-year)"
        />
      </IndicatorGrid>
    </IndicatorSection>
  );
}

// ============================================
// Quality Factors Panel
// ============================================

export interface QualityIndicatorsPanelProps {
  data: QualityIndicators | null | undefined;
  isLoading?: boolean;
  freshness?: Freshness;
}

export function QualityIndicatorsPanel({
  data,
  isLoading,
  freshness = "stale",
}: QualityIndicatorsPanelProps) {
  return (
    <IndicatorSection
      title="Quality Factors"
      icon={<Shield className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
    >
      <IndicatorGrid columns={4}>
        <IndicatorValue
          label="Gross Prof"
          value={data?.gross_profitability}
          format="percent"
          tooltip="Gross profitability (GP/Assets)"
        />
        <IndicatorValue label="ROE" value={data?.roe} format="percent" tooltip="Return on equity" />
        <IndicatorValue label="ROA" value={data?.roa} format="percent" tooltip="Return on assets" />
        <IndicatorValue
          label="Asset Gr"
          value={data?.asset_growth}
          format="percent"
          tooltip="Year-over-year asset growth"
        />
        <IndicatorValue
          label="Accruals"
          value={data?.accruals_ratio}
          format="percent"
          tooltip="Accruals ratio"
        />
        <IndicatorValue
          label="CF Quality"
          value={data?.cash_flow_quality}
          format="percent"
          tooltip="Cash flow quality score"
        />
        <IndicatorValue
          label="M-Score"
          value={data?.beneish_m_score}
          status={getMScoreStatus(data?.beneish_m_score ?? null)}
          tooltip="Beneish M-Score - <-2.22 suggests earnings manipulation"
        />
        <IndicatorValue
          label="Earn Qual"
          value={data?.earnings_quality ?? "--"}
          tooltip="Earnings quality classification"
        />
      </IndicatorGrid>
    </IndicatorSection>
  );
}

// ============================================
// Short Interest Panel
// ============================================

export interface ShortInterestPanelProps {
  data: ShortInterestIndicators | null | undefined;
  isLoading?: boolean;
  freshness?: Freshness;
}

export function ShortInterestPanel({
  data,
  isLoading,
  freshness = "stale",
}: ShortInterestPanelProps) {
  return (
    <IndicatorSection
      title="Short Interest"
      icon={<TrendingDown className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
      lastUpdated={data?.settlement_date ?? undefined}
    >
      <IndicatorGrid columns={4}>
        <IndicatorValue
          label="Short %"
          value={data?.short_pct_float}
          format="percent"
          status={getShortInterestStatus(data?.short_pct_float ?? null)}
          tooltip="Short interest as % of float"
        />
        <IndicatorValue
          label="Days Cover"
          value={data?.days_to_cover}
          format="days"
          tooltip="Days to cover short position"
        />
        <IndicatorValue
          label="SI Ratio"
          value={data?.short_interest_ratio}
          format="ratio"
          tooltip="Short interest ratio"
        />
        <IndicatorValue
          label="Change"
          value={data?.short_interest_change}
          format="percent"
          status={
            data?.short_interest_change && data.short_interest_change > 0
              ? "negative"
              : data?.short_interest_change && data.short_interest_change < 0
                ? "positive"
                : undefined
          }
          tooltip="Change from prior period"
        />
      </IndicatorGrid>
    </IndicatorSection>
  );
}

// ============================================
// Sentiment Panel
// ============================================

export interface SentimentPanelProps {
  data: SentimentIndicators | null | undefined;
  isLoading?: boolean;
  freshness?: Freshness;
}

export function SentimentPanel({ data, isLoading, freshness = "recent" }: SentimentPanelProps) {
  return (
    <IndicatorSection
      title="Sentiment"
      icon={<MessageSquare className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
    >
      <IndicatorGrid columns={4}>
        <IndicatorValue
          label="Score"
          value={data?.overall_score}
          status={getSentimentStatus(data?.overall_score ?? null)}
          tooltip="Overall sentiment score (-1 to 1)"
        />
        <IndicatorValue
          label="Class"
          value={getSentimentLabel(data?.classification ?? null)}
          status={getSentimentStatus(data?.overall_score ?? null)}
        />
        <IndicatorValue
          label="Strength"
          value={data?.sentiment_strength}
          format="percent"
          tooltip="Sentiment strength (confidence)"
        />
        <IndicatorValue
          label="News Vol"
          value={data?.news_volume}
          decimals={0}
          tooltip="News volume (article count)"
        />
        <IndicatorValue
          label="Momentum"
          value={data?.sentiment_momentum}
          status={
            data?.sentiment_momentum && data.sentiment_momentum > 0
              ? "positive"
              : data?.sentiment_momentum && data.sentiment_momentum < 0
                ? "negative"
                : undefined
          }
          tooltip="Sentiment momentum (change)"
        />
        <IndicatorValue
          label="Event Risk"
          value={data?.event_risk ? "Yes" : "No"}
          status={data?.event_risk ? "warning" : undefined}
          tooltip="Event risk flag (earnings, etc.)"
        />
      </IndicatorGrid>
    </IndicatorSection>
  );
}

// ============================================
// Corporate Actions Panel
// ============================================

export interface CorporatePanelProps {
  data: CorporateIndicators | null | undefined;
  isLoading?: boolean;
  freshness?: Freshness;
}

export function CorporatePanel({ data, isLoading, freshness = "stale" }: CorporatePanelProps) {
  return (
    <IndicatorSection
      title="Corporate"
      icon={<Building2 className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
    >
      <IndicatorGrid columns={4}>
        <IndicatorValue
          label="Div Yield"
          value={data?.trailing_dividend_yield}
          format="percent"
          tooltip="Trailing 12-month dividend yield"
        />
        <IndicatorValue
          label="Ex-Div"
          value={data?.ex_dividend_days}
          format="days"
          tooltip="Days until next ex-dividend date"
        />
        <IndicatorValue
          label="Earnings"
          value={data?.upcoming_earnings_days}
          format="days"
          tooltip="Days until next earnings"
        />
        <IndicatorValue
          label="Split"
          value={data?.recent_split ? "Recent" : "None"}
          status={data?.recent_split ? "neutral" : undefined}
          tooltip="Recent stock split"
        />
      </IndicatorGrid>
    </IndicatorSection>
  );
}
