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
// Signal Conversion Functions
// Convert indicator values to -1 (bearish) to +1 (bullish) signals
// ============================================

/**
 * RSI signal: 30-70 is neutral zone
 * <30 = oversold (bullish), >70 = overbought (bearish)
 */
function getRsiSignal(rsi: number | null): number | undefined {
  if (rsi === null) {
    return undefined;
  }
  if (rsi <= 30) {
    return (30 - rsi) / 30; // 0 to +1 as RSI goes 30 to 0
  }
  if (rsi >= 70) {
    return -((rsi - 70) / 30); // 0 to -1 as RSI goes 70 to 100
  }
  // Neutral zone (30-70): slight gradient toward edges
  return ((50 - rsi) / 40) * 0.3; // Small signal in neutral zone
}

/**
 * Stochastic signal: similar to RSI
 * <20 = oversold (bullish), >80 = overbought (bearish)
 */
function getStochasticSignal(stoch: number | null): number | undefined {
  if (stoch === null) {
    return undefined;
  }
  if (stoch <= 20) {
    return (20 - stoch) / 20; // 0 to +1
  }
  if (stoch >= 80) {
    return -((stoch - 80) / 20); // 0 to -1
  }
  return ((50 - stoch) / 60) * 0.3; // Small signal in neutral zone
}

/**
 * MACD histogram signal: positive = bullish, negative = bearish
 * Normalized to reasonable range (clamped at ±5)
 */
function getMacdSignal(histogram: number | null): number | undefined {
  if (histogram === null) {
    return undefined;
  }
  return Math.max(-1, Math.min(1, histogram / 5));
}

/**
 * Momentum signal: positive = bullish, negative = bearish
 * Normalized to ±50% range
 */
function getMomentumSignal(momentum: number | null): number | undefined {
  if (momentum === null) {
    return undefined;
  }
  return Math.max(-1, Math.min(1, momentum / 0.5));
}

/**
 * Bollinger %B signal: >1 overbought (bearish), <0 oversold (bullish)
 * 0.5 is neutral (at middle band)
 */
function getBollingerSignal(percentB: number | null): number | undefined {
  if (percentB === null) {
    return undefined;
  }
  // 0.5 is neutral, 0 is oversold (bullish +1), 1 is overbought (bearish -1)
  return Math.max(-1, Math.min(1, (0.5 - percentB) * 2));
}

/**
 * Put/Call ratio signal: >1 = bearish sentiment, <1 = bullish
 */
function getPutCallSignal(pcRatio: number | null): number | undefined {
  if (pcRatio === null) {
    return undefined;
  }
  // 1.0 is neutral, >1 bearish, <1 bullish
  // Clamp to reasonable range (0.5 to 1.5)
  return Math.max(-1, Math.min(1, (1 - pcRatio) * 2));
}

/**
 * IV Skew signal: positive skew (puts expensive) = bearish/fear
 */
function getSkewSignal(skew: number | null): number | undefined {
  if (skew === null) {
    return undefined;
  }
  // Positive skew = puts more expensive = fear = bearish
  // Normalize to ±20% range
  return Math.max(-1, Math.min(1, -skew / 0.2));
}

/**
 * Short interest signal: high short % = bearish pressure (but squeeze potential)
 */
function getShortInterestSignal(shortPct: number | null): number | undefined {
  if (shortPct === null) {
    return undefined;
  }
  // >20% very high short, normalize to 0-30% range
  return Math.max(-1, Math.min(0, -(shortPct / 0.3) * 2 + 0.3));
}

/**
 * Sentiment score is already -1 to +1, pass through
 */
function getSentimentSignal(score: number | null): number | undefined {
  if (score === null) {
    return undefined;
  }
  return Math.max(-1, Math.min(1, score));
}

/**
 * Days to cover signal: more days = more squeeze risk
 */
function getDaysToCoverSignal(days: number | null): number | undefined {
  if (days === null) {
    return undefined;
  }
  // >5 days is concerning, normalize
  return Math.max(-1, Math.min(0, -(days / 10)));
}

// ============================================
// Legacy Status Functions (for non-gradient indicators)
// ============================================

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
      <IndicatorGrid columns={4}>
        <IndicatorValue
          label="RSI(14)"
          value={data?.rsi_14}
          signal={getRsiSignal(data?.rsi_14 ?? null)}
          tooltip="Momentum oscillator (0-100). >70 overbought (potential sell), <30 oversold (potential buy)"
        />
        <IndicatorValue
          label="ATR(14)"
          value={data?.atr_14}
          tooltip="Average price range over 14 days. Higher = more volatile. Used for stop-loss sizing"
        />
        <IndicatorValue
          label="SMA(20)"
          value={data?.sma_20}
          tooltip="20-day simple moving average. Short-term trend. Price above = bullish"
        />
        <IndicatorValue
          label="SMA(50)"
          value={data?.sma_50}
          tooltip="50-day simple moving average. Medium-term trend. Key support/resistance level"
        />
        <IndicatorValue
          label="SMA(200)"
          value={data?.sma_200}
          tooltip="200-day simple moving average. Long-term trend. Price above = bull market"
        />
        <IndicatorValue
          label="EMA(9)"
          value={data?.ema_9}
          tooltip="9-day exponential MA. Fast-moving, reacts quickly to price changes"
        />
        <IndicatorValue
          label="EMA(12)"
          value={data?.ema_12}
          tooltip="12-day exponential MA. Used in MACD calculation. Short-term trend"
        />
        <IndicatorValue
          label="EMA(21)"
          value={data?.ema_21}
          tooltip="21-day exponential MA. Popular swing trading reference"
        />
        <IndicatorValue
          label="EMA(26)"
          value={data?.ema_26}
          tooltip="26-day exponential MA. Used in MACD calculation. Medium-term trend"
        />
        <IndicatorValue
          label="MACD"
          value={data?.macd_line}
          signal={getMacdSignal(data?.macd_line ?? null)}
          tooltip="Trend/momentum indicator. Positive = bullish momentum, negative = bearish"
        />
        <IndicatorValue
          label="Signal"
          value={data?.macd_signal}
          signal={getMacdSignal(data?.macd_signal ?? null)}
          tooltip="9-day EMA of MACD. MACD crossing above = buy signal, below = sell signal"
        />
        <IndicatorValue
          label="Histogram"
          value={data?.macd_histogram}
          signal={getMacdSignal(data?.macd_histogram ?? null)}
          tooltip="MACD minus Signal. Growing = strengthening trend, shrinking = weakening"
        />
        <IndicatorValue
          label="BB Upper"
          value={data?.bollinger_upper}
          tooltip="Upper band (SMA20 + 2 std dev). Price near upper = potentially overbought"
        />
        <IndicatorValue
          label="BB Middle"
          value={data?.bollinger_middle}
          tooltip="Middle band (20-day SMA). Acts as dynamic support/resistance"
        />
        <IndicatorValue
          label="BB Lower"
          value={data?.bollinger_lower}
          tooltip="Lower band (SMA20 - 2 std dev). Price near lower = potentially oversold"
        />
        <IndicatorValue
          label="BB %B"
          value={data?.bollinger_percentb}
          format="percent"
          signal={getBollingerSignal(data?.bollinger_percentb ?? null)}
          tooltip="Price position in bands. >100% = above upper, <0% = below lower, 50% = at middle"
        />
        <IndicatorValue
          label="Stoch %K"
          value={data?.stochastic_k}
          signal={getStochasticSignal(data?.stochastic_k ?? null)}
          tooltip="Fast stochastic (0-100). >80 overbought, <20 oversold. Shows momentum"
        />
        <IndicatorValue
          label="Stoch %D"
          value={data?.stochastic_d}
          signal={getStochasticSignal(data?.stochastic_d ?? null)}
          tooltip="Slow stochastic (3-day avg of %K). %K crossing %D = trading signal"
        />
        <IndicatorValue
          label="Mom 1M"
          value={data?.momentum_1m}
          format="percent"
          signal={getMomentumSignal(data?.momentum_1m ?? null)}
          tooltip="Price change over 1 month. Positive = uptrend, negative = downtrend"
        />
        <IndicatorValue
          label="Mom 3M"
          value={data?.momentum_3m}
          format="percent"
          signal={getMomentumSignal(data?.momentum_3m ?? null)}
          tooltip="Price change over 3 months. Shows medium-term trend strength"
        />
        <IndicatorValue
          label="Vol 20D"
          value={data?.realized_vol_20d}
          format="percent"
          tooltip="Annualized price volatility over 20 days. Higher = more risk/opportunity"
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
          tooltip="Gap between buy and sell price. Smaller = more liquid, cheaper to trade"
        />
        <IndicatorValue
          label="Spread %"
          value={data?.bid_ask_spread_pct}
          format="percent"
          decimals={3}
          tooltip="Spread as % of price. <0.1% = very liquid, >1% = illiquid"
        />
        <IndicatorValue
          label="Amihud"
          value={data?.amihud_illiquidity}
          decimals={4}
          tooltip="Price impact per dollar traded. Higher = harder to trade large sizes"
        />
        <IndicatorValue
          label="VWAP"
          value={data?.vwap}
          format="currency"
          tooltip="Volume-weighted average price today. Institutional benchmark for execution"
        />
        <IndicatorValue
          label="Turnover"
          value={data?.turnover_ratio}
          format="percent"
          tooltip="Daily volume / shares outstanding. Higher = more active trading"
        />
        <IndicatorValue
          label="Vol Ratio"
          value={data?.volume_ratio}
          format="ratio"
          tooltip="Today's volume vs 20-day avg. >1 = above average activity"
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
  // Check if we have any options data
  const hasOptionsData =
    data?.atm_iv != null || data?.iv_skew_25d != null || data?.put_call_ratio_volume != null;

  return (
    <IndicatorSection
      title="Options"
      icon={<Activity className="h-4 w-4" />}
      isLoading={isLoading}
      freshness={freshness}
    >
      {!isLoading && !hasOptionsData && (
        <p className="text-xs text-stone-400 dark:text-night-500 mb-3">
          Options data requires market hours (9:30 AM - 4:00 PM ET)
        </p>
      )}
      <IndicatorGrid columns={4}>
        <IndicatorValue
          label="ATM IV"
          value={data?.atm_iv}
          format="percent"
          tooltip="Expected annualized move priced into options. Higher = more expensive options"
        />
        <IndicatorValue
          label="IV Skew"
          value={data?.iv_skew_25d}
          format="percent"
          signal={getSkewSignal(data?.iv_skew_25d ?? null)}
          tooltip="Put vs call IV difference. Positive = puts more expensive (fear/hedging)"
        />
        <IndicatorValue
          label="P/C Vol"
          value={data?.put_call_ratio_volume}
          format="ratio"
          signal={getPutCallSignal(data?.put_call_ratio_volume ?? null)}
          tooltip="Put volume / call volume. >1 = more bearish bets, <1 = more bullish"
        />
        <IndicatorValue
          label="P/C OI"
          value={data?.put_call_ratio_oi}
          format="ratio"
          signal={getPutCallSignal(data?.put_call_ratio_oi ?? null)}
          tooltip="Put / call open interest. Shows accumulated positioning, not just today"
        />
        <IndicatorValue
          label="Term Slope"
          value={data?.term_structure_slope}
          format="percent"
          tooltip="IV curve slope. Positive = normal (contango), negative = fear (backwardation)"
        />
        <IndicatorValue
          label="VRP"
          value={data?.vrp}
          format="percent"
          tooltip="Implied minus realized vol. Positive = options overpriced, favor selling"
        />
        <IndicatorValue
          label="Net Delta"
          value={data?.net_delta}
          decimals={0}
          tooltip="Directional exposure in shares. Positive = long, negative = short equivalent"
        />
        <IndicatorValue
          label="Net Gamma"
          value={data?.net_gamma}
          decimals={0}
          tooltip="Delta sensitivity to price. Positive = gains accelerate on moves either way"
        />
        <IndicatorValue
          label="Net Theta"
          value={data?.net_theta}
          format="currency"
          tooltip="Daily time decay. Negative = losing value daily, positive = earning"
        />
        <IndicatorValue
          label="Net Vega"
          value={data?.net_vega}
          format="currency"
          tooltip="IV sensitivity. Positive = profits if IV rises, negative = profits if IV falls"
        />
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
          tooltip="Price / last 12 months earnings. Lower = cheaper. Compare to sector avg"
        />
        <IndicatorValue
          label="P/E (Fwd)"
          value={data?.pe_ratio_forward}
          format="ratio"
          tooltip="Price / expected earnings. Lower than TTM = growth expected"
        />
        <IndicatorValue
          label="P/B"
          value={data?.pb_ratio}
          format="ratio"
          tooltip="Price / book value. <1 = trading below asset value (potentially undervalued)"
        />
        <IndicatorValue
          label="EV/EBITDA"
          value={data?.ev_ebitda}
          format="ratio"
          tooltip="Enterprise value / operating profit. Debt-adjusted valuation. Lower = cheaper"
        />
        <IndicatorValue
          label="Earn Yield"
          value={data?.earnings_yield}
          format="percent"
          tooltip="Earnings / price (inverse P/E). Compare to bond yields for relative value"
        />
        <IndicatorValue
          label="Div Yield"
          value={data?.dividend_yield}
          format="percent"
          tooltip="Annual dividends / price. Income return. Higher = more income"
        />
        <IndicatorValue
          label="CAPE"
          value={data?.cape_10yr}
          format="ratio"
          tooltip="Price / 10-year avg earnings (inflation-adjusted). Smooths cycle effects"
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
          tooltip="Gross profit / assets. Higher = more efficient. Strong quality signal"
        />
        <IndicatorValue
          label="ROE"
          value={data?.roe}
          format="percent"
          tooltip="Net income / equity. How well company uses shareholder capital. >15% = good"
        />
        <IndicatorValue
          label="ROA"
          value={data?.roa}
          format="percent"
          tooltip="Net income / assets. Efficiency regardless of financing. >5% = good"
        />
        <IndicatorValue
          label="Asset Gr"
          value={data?.asset_growth}
          format="percent"
          tooltip="YoY asset growth. High growth can dilute returns. Moderate is often better"
        />
        <IndicatorValue
          label="Accruals"
          value={data?.accruals_ratio}
          format="percent"
          tooltip="Non-cash earnings portion. High accruals = lower quality, potential manipulation"
        />
        <IndicatorValue
          label="CF Quality"
          value={data?.cash_flow_quality}
          format="percent"
          tooltip="Operating cash flow / net income. >100% = high quality (cash backs earnings)"
        />
        <IndicatorValue
          label="M-Score"
          value={data?.beneish_m_score}
          status={getMScoreStatus(data?.beneish_m_score ?? null)}
          tooltip="Earnings manipulation probability. >-2.22 = likely manipulator. Red flag"
        />
        <IndicatorValue
          label="Earn Qual"
          value={data?.earnings_quality ?? "--"}
          tooltip="Overall earnings quality rating based on multiple factors"
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
          signal={getShortInterestSignal(data?.short_pct_float ?? null)}
          tooltip="Shares sold short / float. >10% = high, >20% = very high (squeeze potential)"
        />
        <IndicatorValue
          label="Days Cover"
          value={data?.days_to_cover}
          format="days"
          signal={getDaysToCoverSignal(data?.days_to_cover ?? null)}
          tooltip="Days to close all shorts at avg volume. >5 days = potential squeeze risk"
        />
        <IndicatorValue
          label="SI Ratio"
          value={data?.short_interest_ratio}
          format="ratio"
          tooltip="Short shares / avg daily volume. Higher = more crowded short"
        />
        <IndicatorValue
          label="Change"
          value={data?.short_interest_change}
          format="percent"
          signal={
            data?.short_interest_change !== null && data?.short_interest_change !== undefined
              ? -data.short_interest_change * 5 // Rising short interest = bearish
              : undefined
          }
          tooltip="Change vs prior report. Rising = more bearish bets, falling = covering"
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
          signal={getSentimentSignal(data?.overall_score ?? null)}
          tooltip="Aggregate sentiment (-1 to 1). >0.2 bullish, <-0.2 bearish"
        />
        <IndicatorValue
          label="Class"
          value={getSentimentLabel(data?.classification ?? null)}
          signal={getSentimentSignal(data?.overall_score ?? null)}
          tooltip="Sentiment category based on score. Combines news, social, and analyst data"
        />
        <IndicatorValue
          label="Strength"
          value={data?.sentiment_strength}
          format="percent"
          tooltip="Confidence in sentiment reading. Higher = more reliable signal"
        />
        <IndicatorValue
          label="News Vol"
          value={data?.news_volume}
          decimals={0}
          tooltip="Recent article count. High volume = more attention, potential catalyst"
        />
        <IndicatorValue
          label="Momentum"
          value={data?.sentiment_momentum}
          signal={getSentimentSignal(data?.sentiment_momentum ?? null)}
          tooltip="Sentiment change direction. Rising = improving outlook, falling = deteriorating"
        />
        <IndicatorValue
          label="Event Risk"
          value={data?.event_risk ? "Yes" : "No"}
          status={data?.event_risk ? "warning" : undefined}
          tooltip="Upcoming catalyst (earnings, FDA, etc.). Yes = expect volatility"
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
          tooltip="Annual dividend / price. Must own before ex-div date to receive"
        />
        <IndicatorValue
          label="Ex-Div"
          value={data?.ex_dividend_days}
          format="days"
          tooltip="Days until ex-dividend. Buy before to receive dividend, expect price drop after"
        />
        <IndicatorValue
          label="Earnings"
          value={data?.upcoming_earnings_days}
          format="days"
          tooltip="Days until earnings report. Expect high IV and potential gap"
        />
        <IndicatorValue
          label="Split"
          value={data?.recent_split ? "Recent" : "None"}
          status={data?.recent_split ? "neutral" : undefined}
          tooltip="Stock split status. Recent splits may affect historical chart comparisons"
        />
      </IndicatorGrid>
    </IndicatorSection>
  );
}
