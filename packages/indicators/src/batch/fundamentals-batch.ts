/**
 * Fundamentals Batch Job
 *
 * Fetches and calculates fundamental indicators from FMP API.
 * Runs nightly to populate value and quality factors.
 *
 * Academic references:
 * - Novy-Marx (2013): Gross Profitability
 * - Cooper et al (2008): Asset Growth
 * - Sloan (1996): Accruals Anomaly
 * - Beneish (1999): M-Score manipulation detection
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import type { CreateFundamentalIndicatorsInput, FundamentalsRepository } from "@cream/storage";
import { log } from "../logger.js";

// ============================================
// Types
// ============================================

export interface FMPKeyMetrics {
  symbol: string;
  date: string;
  calendarYear: string;
  period: string;
  peRatio: number | null;
  priceToSalesRatio: number | null;
  pbRatio: number | null;
  enterpriseValueOverEBITDA: number | null;
  earningsYield: number | null;
  dividendYield: number | null;
  roe: number | null;
  returnOnAssets: number | null;
  marketCap: number | null;
}

export interface FMPIncomeStatement {
  symbol: string;
  date: string;
  calendarYear: string;
  period: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  netIncome: number;
  operatingIncome: number;
  depreciationAndAmortization: number;
}

export interface FMPBalanceSheet {
  symbol: string;
  date: string;
  calendarYear: string;
  period: string;
  totalAssets: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  totalStockholdersEquity: number;
  inventory: number;
  netReceivables: number;
  accountPayables: number;
  propertyPlantEquipmentNet: number;
}

export interface FMPCashFlowStatement {
  symbol: string;
  date: string;
  calendarYear: string;
  period: string;
  operatingCashFlow: number;
  netIncome: number;
  depreciationAndAmortization: number;
  capitalExpenditure: number;
}

export interface FMPCompanyProfile {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  mktCap: number;
  price: number;
}

export interface FundamentalsFMPClient {
  getKeyMetrics(
    symbol: string,
    params?: { period?: string; limit?: number }
  ): Promise<FMPKeyMetrics[]>;
  getIncomeStatement(
    symbol: string,
    params?: { period?: string; limit?: number }
  ): Promise<FMPIncomeStatement[]>;
  getBalanceSheet(
    symbol: string,
    params?: { period?: string; limit?: number }
  ): Promise<FMPBalanceSheet[]>;
  getCashFlowStatement(
    symbol: string,
    params?: { period?: string; limit?: number }
  ): Promise<FMPCashFlowStatement[]>;
  getCompanyProfile(symbol: string): Promise<FMPCompanyProfile | null>;
}

export interface BatchJobResult {
  processed: number;
  failed: number;
  errors: Array<{ symbol: string; error: string }>;
  durationMs: number;
}

export interface FundamentalsBatchJobConfig {
  /** Rate limit delay between symbols in ms (default: 200ms for FMP starter tier) */
  rateLimitDelayMs?: number;
  /** Max retries per symbol (default: 2) */
  maxRetries?: number;
  /** Retry delay in ms (default: 1000) */
  retryDelayMs?: number;
  /** Continue on individual symbol errors (default: true) */
  continueOnError?: boolean;
}

// ============================================
// Calculation Functions
// ============================================

/**
 * Calculate Gross Profitability (Novy-Marx 2013)
 * Formula: (Revenue - COGS) / Total Assets
 * Higher is better - indicates efficient asset use for generating gross profit
 */
export function calculateGrossProfitability(
  income: FMPIncomeStatement,
  balance: FMPBalanceSheet
): number | null {
  if (!balance.totalAssets || balance.totalAssets === 0) {
    return null;
  }
  const grossProfit = income.revenue - income.costOfRevenue;
  return grossProfit / balance.totalAssets;
}

/**
 * Calculate Asset Growth (Cooper et al 2008)
 * Formula: (Assets_t - Assets_{t-1}) / Assets_{t-1}
 * High asset growth tends to predict lower future returns
 */
export function calculateAssetGrowth(
  currentBalance: FMPBalanceSheet,
  priorBalance: FMPBalanceSheet
): number | null {
  if (!priorBalance.totalAssets || priorBalance.totalAssets === 0) {
    return null;
  }
  return (currentBalance.totalAssets - priorBalance.totalAssets) / priorBalance.totalAssets;
}

/**
 * Calculate Accruals Ratio (Sloan 1996)
 * Simplified formula: (Net Income - Operating Cash Flow) / Total Assets
 * High accruals suggest lower earnings quality
 */
export function calculateAccrualsRatio(
  income: FMPIncomeStatement,
  cashflow: FMPCashFlowStatement,
  balance: FMPBalanceSheet
): number | null {
  if (!balance.totalAssets || balance.totalAssets === 0) {
    return null;
  }
  return (income.netIncome - cashflow.operatingCashFlow) / balance.totalAssets;
}

/**
 * Calculate Cash Flow Quality
 * Formula: Operating Cash Flow / Net Income
 * Values > 1 suggest high quality earnings (cash-backed)
 * Values < 1 suggest earnings driven by accruals
 */
export function calculateCashFlowQuality(
  income: FMPIncomeStatement,
  cashflow: FMPCashFlowStatement
): number | null {
  if (!income.netIncome || income.netIncome === 0) {
    return null;
  }
  return cashflow.operatingCashFlow / income.netIncome;
}

/**
 * Calculate Beneish M-Score (Beneish 1999)
 * 8-variable model to detect earnings manipulation
 * Score > -2.22 suggests higher probability of manipulation
 *
 * Components:
 * DSRI (Days Sales in Receivables Index)
 * GMI (Gross Margin Index)
 * AQI (Asset Quality Index)
 * SGI (Sales Growth Index)
 * DEPI (Depreciation Index)
 * SGAI (SG&A Index)
 * LVGI (Leverage Index)
 * TATA (Total Accruals to Total Assets)
 */
export function calculateBeneishMScore(
  currentIncome: FMPIncomeStatement,
  priorIncome: FMPIncomeStatement,
  currentBalance: FMPBalanceSheet,
  priorBalance: FMPBalanceSheet,
  currentCashflow: FMPCashFlowStatement
): number | null {
  // Need prior period data for comparison
  if (!priorIncome || !priorBalance) {
    return null;
  }

  // Calculate individual components
  // DSRI: Days Sales in Receivables Index
  const currentDSR = currentBalance.netReceivables / (currentIncome.revenue / 365);
  const priorDSR = priorBalance.netReceivables / (priorIncome.revenue / 365);
  const dsri = priorDSR !== 0 ? currentDSR / priorDSR : 1;

  // GMI: Gross Margin Index
  const currentGM = currentIncome.grossProfit / currentIncome.revenue;
  const priorGM = priorIncome.grossProfit / priorIncome.revenue;
  const gmi = currentGM !== 0 ? priorGM / currentGM : 1;

  // AQI: Asset Quality Index
  const currentAQ =
    1 -
    (currentBalance.totalCurrentAssets + currentBalance.propertyPlantEquipmentNet) /
      currentBalance.totalAssets;
  const priorAQ =
    1 -
    (priorBalance.totalCurrentAssets + priorBalance.propertyPlantEquipmentNet) /
      priorBalance.totalAssets;
  const aqi = priorAQ !== 0 ? currentAQ / priorAQ : 1;

  // SGI: Sales Growth Index
  const sgi = priorIncome.revenue !== 0 ? currentIncome.revenue / priorIncome.revenue : 1;

  // DEPI: Depreciation Index (approximation using D&A)
  const currentDepRate =
    currentIncome.depreciationAndAmortization /
    (currentBalance.propertyPlantEquipmentNet + currentIncome.depreciationAndAmortization);
  const priorDepRate =
    priorIncome.depreciationAndAmortization /
    (priorBalance.propertyPlantEquipmentNet + priorIncome.depreciationAndAmortization);
  const depi = currentDepRate !== 0 ? priorDepRate / currentDepRate : 1;

  // SGAI: SG&A Index (using operating expenses as proxy)
  const currentSGAI =
    (currentIncome.revenue - currentIncome.costOfRevenue - currentIncome.operatingIncome) /
    currentIncome.revenue;
  const priorSGAI =
    (priorIncome.revenue - priorIncome.costOfRevenue - priorIncome.operatingIncome) /
    priorIncome.revenue;
  const sgai = priorSGAI !== 0 ? currentSGAI / priorSGAI : 1;

  // LVGI: Leverage Index
  const currentLeverage =
    (currentBalance.totalAssets - currentBalance.totalStockholdersEquity) /
    currentBalance.totalAssets;
  const priorLeverage =
    (priorBalance.totalAssets - priorBalance.totalStockholdersEquity) / priorBalance.totalAssets;
  const lvgi = priorLeverage !== 0 ? currentLeverage / priorLeverage : 1;

  // TATA: Total Accruals to Total Assets
  const tata =
    (currentIncome.netIncome - currentCashflow.operatingCashFlow) / currentBalance.totalAssets;

  // Beneish M-Score formula (1999 coefficients)
  const mScore =
    -4.84 +
    0.92 * dsri +
    0.528 * gmi +
    0.404 * aqi +
    0.892 * sgi +
    0.115 * depi +
    -0.172 * sgai +
    4.679 * tata +
    -0.327 * lvgi;

  return Number.isFinite(mScore) ? mScore : null;
}

/**
 * Generate unique ID for fundamental indicators record
 */
function generateId(): string {
  return `fund_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function today(): string {
  const datePart = new Date().toISOString().split("T")[0];
  if (!datePart) {
    throw new Error("Failed to get today's date");
  }
  return datePart;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Batch Job Class
// ============================================

export class FundamentalsBatchJob {
  private readonly fmp: FundamentalsFMPClient;
  private readonly repo: FundamentalsRepository;
  private readonly config: Required<FundamentalsBatchJobConfig>;

  constructor(
    fmp: FundamentalsFMPClient,
    repo: FundamentalsRepository,
    config?: FundamentalsBatchJobConfig
  ) {
    this.fmp = fmp;
    this.repo = repo;
    this.config = {
      rateLimitDelayMs: config?.rateLimitDelayMs ?? 200,
      maxRetries: config?.maxRetries ?? 2,
      retryDelayMs: config?.retryDelayMs ?? 1000,
      continueOnError: config?.continueOnError ?? true,
    };
  }

  /**
   * Run batch job for a list of symbols
   */
  async run(symbols: string[]): Promise<BatchJobResult> {
    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
    const errors: Array<{ symbol: string; error: string }> = [];

    log.info({ symbolCount: symbols.length }, "Starting fundamentals batch job");

    for (const symbol of symbols) {
      try {
        await this.processSymbol(symbol);
        processed++;
        log.debug({ symbol, processed, total: symbols.length }, "Processed symbol");
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ symbol, error: errorMessage });
        log.warn({ symbol, error: errorMessage }, "Failed to process symbol");

        if (!this.config.continueOnError) {
          throw error;
        }
      }

      // Rate limiting
      if (symbols.indexOf(symbol) < symbols.length - 1) {
        await sleep(this.config.rateLimitDelayMs);
      }
    }

    const durationMs = Date.now() - startTime;
    log.info({ processed, failed, durationMs }, "Completed fundamentals batch job");

    return { processed, failed, errors, durationMs };
  }

  /**
   * Process a single symbol with retries
   */
  private async processSymbol(symbol: string): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.fetchAndStore(symbol);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.maxRetries) {
          await sleep(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error(`Failed to process ${symbol}`);
  }

  /**
   * Fetch data from FMP and store in repository
   */
  private async fetchAndStore(symbol: string): Promise<void> {
    // Fetch all data in parallel
    const [keyMetrics, incomeStatements, balanceSheets, cashFlows, profile] = await Promise.all([
      this.fmp.getKeyMetrics(symbol, { period: "annual", limit: 2 }),
      this.fmp.getIncomeStatement(symbol, { period: "annual", limit: 2 }),
      this.fmp.getBalanceSheet(symbol, { period: "annual", limit: 2 }),
      this.fmp.getCashFlowStatement(symbol, { period: "annual", limit: 2 }),
      this.fmp.getCompanyProfile(symbol),
    ]);

    // Need at least current period data
    const currentMetrics = keyMetrics[0];
    const currentIncome = incomeStatements[0];
    const currentBalance = balanceSheets[0];
    if (!currentMetrics || !currentIncome || !currentBalance) {
      throw new Error(`Insufficient data for ${symbol}`);
    }

    const currentCashflow = cashFlows[0];

    // Prior period for growth calculations (optional)
    const priorIncome = incomeStatements[1];
    const priorBalance = balanceSheets[1];

    // Calculate quality factors
    const grossProfitability = calculateGrossProfitability(currentIncome, currentBalance);
    const assetGrowth = priorBalance ? calculateAssetGrowth(currentBalance, priorBalance) : null;
    const accrualsRatio = currentCashflow
      ? calculateAccrualsRatio(currentIncome, currentCashflow, currentBalance)
      : null;
    const cashFlowQuality = currentCashflow
      ? calculateCashFlowQuality(currentIncome, currentCashflow)
      : null;
    const beneishMScore =
      priorIncome && priorBalance && currentCashflow
        ? calculateBeneishMScore(
            currentIncome,
            priorIncome,
            currentBalance,
            priorBalance,
            currentCashflow
          )
        : null;

    // Build input for repository
    const input: CreateFundamentalIndicatorsInput = {
      id: generateId(),
      symbol,
      date: today(),

      // Value factors from key metrics
      peRatioTtm: currentMetrics.peRatio,
      peRatioForward: null, // FMP doesn't provide forward P/E in key-metrics
      pbRatio: currentMetrics.pbRatio,
      evEbitda: currentMetrics.enterpriseValueOverEBITDA,
      earningsYield: currentMetrics.earningsYield,
      dividendYield: currentMetrics.dividendYield,
      cape10yr: null, // Requires 10 years of data

      // Quality factors (calculated)
      grossProfitability,
      roe: currentMetrics.roe,
      roa: currentMetrics.returnOnAssets,
      assetGrowth,
      accrualsRatio,
      cashFlowQuality,
      beneishMScore,

      // Market context
      marketCap: profile?.mktCap ?? currentMetrics.marketCap,
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,

      source: "FMP",
    };

    // Upsert to repository
    await this.repo.upsert(input);
  }
}
