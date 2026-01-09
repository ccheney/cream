/**
 * Signal Recorder
 *
 * Records paper trading signals and outcomes for indicator evaluation.
 * Tracks signals at time T and their eventual forward returns at T+horizon.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 955-1000)
 */

import type { TursoClient } from "@cream/storage";

export interface PaperSignal {
  id: string;
  indicatorId: string;
  date: string;
  symbol: string;
  signal: number;
  outcome: number | null;
  createdAt: string;
}

export interface PendingOutcome {
  id: string;
  indicatorId: string;
  date: string;
  symbol: string;
  signal: number;
}

export interface SignalRecorderConfig {
  /** Forward return horizon in trading days (default: 5) */
  horizonDays?: number;
}

const DEFAULT_HORIZON_DAYS = 5;

function extractDatePart(d: Date): string {
  const isoString = d.toISOString();
  const parts = isoString.split("T");
  return parts[0] ?? isoString.slice(0, 10);
}

/**
 * Subtract trading days from a date (approximate - skips weekends)
 */
export function subtractTradingDays(date: string, days: number): string {
  const d = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }

  return extractDatePart(d);
}

/**
 * Add trading days to a date (approximate - skips weekends)
 */
export function addTradingDays(date: string, days: number): string {
  const d = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }

  return extractDatePart(d);
}

function generateSignalId(indicatorId: string, date: string, symbol: string): string {
  return `ps-${indicatorId}-${date}-${symbol}`.replace(/[^a-zA-Z0-9-]/g, "-");
}

/**
 * Signal Recorder for paper trading validation.
 *
 * Records indicator signals and their eventual outcomes to validate
 * indicator performance in live market conditions before production promotion.
 *
 * @example
 * ```typescript
 * const recorder = new SignalRecorder(db);
 *
 * // Record today's signals
 * const signals = new Map([["AAPL", 0.8], ["MSFT", -0.5]]);
 * await recorder.recordSignals("indicator-123", "2024-01-15", signals);
 *
 * // Later, record outcomes for signals from 5 days ago
 * const outcomes = new Map([["AAPL", 0.02], ["MSFT", -0.01]]);
 * await recorder.recordOutcomes("indicator-123", "2024-01-20", outcomes);
 *
 * // Get all signals for evaluation
 * const allSignals = await recorder.getSignals("indicator-123");
 * ```
 */
export class SignalRecorder {
  private readonly horizonDays: number;

  constructor(
    private readonly db: TursoClient,
    config: SignalRecorderConfig = {}
  ) {
    this.horizonDays = config.horizonDays ?? DEFAULT_HORIZON_DAYS;
  }

  /**
   * Record signals for a specific date.
   *
   * @param indicatorId - Indicator identifier
   * @param date - Date of signals (YYYY-MM-DD)
   * @param signals - Map of symbol to signal value (-1 to 1)
   */
  async recordSignals(
    indicatorId: string,
    date: string,
    signals: Map<string, number>
  ): Promise<void> {
    if (signals.size === 0) {
      return;
    }

    const values: string[] = [];
    const args: unknown[] = [];
    let paramIndex = 0;

    for (const [symbol, signal] of signals) {
      const id = generateSignalId(indicatorId, date, symbol);
      values.push(
        `(?${++paramIndex}, ?${++paramIndex}, ?${++paramIndex}, ?${++paramIndex}, ?${++paramIndex})`
      );
      args.push(id, indicatorId, date, symbol, signal);
    }

    await this.db.run(
      `INSERT OR REPLACE INTO indicator_paper_signals
       (id, indicator_id, date, symbol, signal)
       VALUES ${values.join(", ")}`,
      args
    );
  }

  /**
   * Record outcomes for signals from horizonDays ago.
   *
   * @param indicatorId - Indicator identifier
   * @param currentDate - Current date (outcomes will update signals from horizonDays ago)
   * @param outcomes - Map of symbol to forward return
   */
  async recordOutcomes(
    indicatorId: string,
    currentDate: string,
    outcomes: Map<string, number>
  ): Promise<void> {
    if (outcomes.size === 0) {
      return;
    }

    const signalDate = subtractTradingDays(currentDate, this.horizonDays);

    for (const [symbol, outcome] of outcomes) {
      await this.db.run(
        `UPDATE indicator_paper_signals
         SET outcome = ?
         WHERE indicator_id = ? AND date = ? AND symbol = ?`,
        [outcome, indicatorId, signalDate, symbol]
      );
    }
  }

  /**
   * Get signals with pending outcomes (older than horizon).
   *
   * @param indicatorId - Indicator identifier
   * @returns Signals that need outcomes recorded
   */
  async getPendingOutcomes(indicatorId: string): Promise<PendingOutcome[]> {
    const today = extractDatePart(new Date());
    const cutoffDate = subtractTradingDays(today, this.horizonDays);

    const rows = await this.db.execute<{
      id: string;
      indicator_id: string;
      date: string;
      symbol: string;
      signal: number;
    }>(
      `SELECT id, indicator_id, date, symbol, signal
       FROM indicator_paper_signals
       WHERE indicator_id = ?
         AND outcome IS NULL
         AND date <= ?
       ORDER BY date`,
      [indicatorId, cutoffDate]
    );

    return rows.map((row) => ({
      id: row.id,
      indicatorId: row.indicator_id,
      date: row.date,
      symbol: row.symbol,
      signal: row.signal,
    }));
  }

  /**
   * Get all signals for an indicator.
   *
   * @param indicatorId - Indicator identifier
   * @param options - Filter options
   * @returns All paper signals
   */
  async getSignals(
    indicatorId: string,
    options: { startDate?: string; endDate?: string; withOutcomesOnly?: boolean } = {}
  ): Promise<PaperSignal[]> {
    let sql = `SELECT * FROM indicator_paper_signals WHERE indicator_id = ?`;
    const args: unknown[] = [indicatorId];

    if (options.startDate) {
      sql += " AND date >= ?";
      args.push(options.startDate);
    }

    if (options.endDate) {
      sql += " AND date <= ?";
      args.push(options.endDate);
    }

    if (options.withOutcomesOnly) {
      sql += " AND outcome IS NOT NULL";
    }

    sql += " ORDER BY date, symbol";

    const rows = await this.db.execute<{
      id: string;
      indicator_id: string;
      date: string;
      symbol: string;
      signal: number;
      outcome: number | null;
      created_at: string;
    }>(sql, args);

    return rows.map((row) => ({
      id: row.id,
      indicatorId: row.indicator_id,
      date: row.date,
      symbol: row.symbol,
      signal: row.signal,
      outcome: row.outcome,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get unique symbols from signals for a specific date.
   *
   * @param indicatorId - Indicator identifier
   * @param date - Date to query
   * @returns Array of symbols
   */
  async getSymbolsForDate(indicatorId: string, date: string): Promise<string[]> {
    const rows = await this.db.execute<{ symbol: string }>(
      `SELECT DISTINCT symbol
       FROM indicator_paper_signals
       WHERE indicator_id = ? AND date = ?`,
      [indicatorId, date]
    );

    return rows.map((row) => row.symbol);
  }

  /**
   * Get count of signals with and without outcomes.
   *
   * @param indicatorId - Indicator identifier
   * @returns Signal statistics
   */
  async getSignalStats(indicatorId: string): Promise<{
    total: number;
    withOutcomes: number;
    pendingOutcomes: number;
    uniqueDates: number;
  }> {
    const statsRow = await this.db.get<{
      total: number;
      with_outcomes: number;
      unique_dates: number;
    }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN outcome IS NOT NULL THEN 1 ELSE 0 END) as with_outcomes,
         COUNT(DISTINCT date) as unique_dates
       FROM indicator_paper_signals
       WHERE indicator_id = ?`,
      [indicatorId]
    );

    const total = statsRow?.total ?? 0;
    const withOutcomes = statsRow?.with_outcomes ?? 0;

    return {
      total,
      withOutcomes,
      pendingOutcomes: total - withOutcomes,
      uniqueDates: statsRow?.unique_dates ?? 0,
    };
  }

  /**
   * Delete all signals for an indicator.
   *
   * @param indicatorId - Indicator identifier
   */
  async deleteSignals(indicatorId: string): Promise<void> {
    await this.db.run(`DELETE FROM indicator_paper_signals WHERE indicator_id = ?`, [indicatorId]);
  }
}
