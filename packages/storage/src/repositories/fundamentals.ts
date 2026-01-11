/**
 * Fundamentals Repository
 *
 * CRUD operations for the fundamental_indicators table.
 * Stores fundamental data (P/E, P/B, ROE, ROA, etc.) from FMP.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 * @see migrations/008_indicator_engine_v2.sql
 */

import type { Row, TursoClient } from "../turso.js";
import { type PaginatedResult, type PaginationOptions, paginate, RepositoryError } from "./base.js";

// ============================================
// Types
// ============================================

export interface FundamentalIndicators {
  id: string;
  symbol: string;
  date: string;

  // Value factors
  peRatioTtm: number | null;
  peRatioForward: number | null;
  pbRatio: number | null;
  evEbitda: number | null;
  earningsYield: number | null;
  dividendYield: number | null;
  cape10yr: number | null;

  // Quality factors
  grossProfitability: number | null;
  roe: number | null;
  roa: number | null;
  assetGrowth: number | null;
  accrualsRatio: number | null;
  cashFlowQuality: number | null;
  beneishMScore: number | null;

  // Size/market context
  marketCap: number | null;
  sector: string | null;
  industry: string | null;

  // Metadata
  source: string;
  computedAt: string;
}

export interface CreateFundamentalIndicatorsInput {
  id: string;
  symbol: string;
  date: string;

  peRatioTtm?: number | null;
  peRatioForward?: number | null;
  pbRatio?: number | null;
  evEbitda?: number | null;
  earningsYield?: number | null;
  dividendYield?: number | null;
  cape10yr?: number | null;

  grossProfitability?: number | null;
  roe?: number | null;
  roa?: number | null;
  assetGrowth?: number | null;
  accrualsRatio?: number | null;
  cashFlowQuality?: number | null;
  beneishMScore?: number | null;

  marketCap?: number | null;
  sector?: string | null;
  industry?: string | null;

  source?: string;
}

export interface UpdateFundamentalIndicatorsInput {
  peRatioTtm?: number | null;
  peRatioForward?: number | null;
  pbRatio?: number | null;
  evEbitda?: number | null;
  earningsYield?: number | null;
  dividendYield?: number | null;
  cape10yr?: number | null;

  grossProfitability?: number | null;
  roe?: number | null;
  roa?: number | null;
  assetGrowth?: number | null;
  accrualsRatio?: number | null;
  cashFlowQuality?: number | null;
  beneishMScore?: number | null;

  marketCap?: number | null;
  sector?: string | null;
  industry?: string | null;
}

export interface FundamentalFilters {
  symbol?: string;
  symbols?: string[];
  sector?: string;
  industry?: string;
  startDate?: string;
  endDate?: string;
}

// ============================================
// Row Mapper
// ============================================

function mapRow(row: Row): FundamentalIndicators {
  return {
    id: row.id as string,
    symbol: row.symbol as string,
    date: row.date as string,

    peRatioTtm: row.pe_ratio_ttm as number | null,
    peRatioForward: row.pe_ratio_forward as number | null,
    pbRatio: row.pb_ratio as number | null,
    evEbitda: row.ev_ebitda as number | null,
    earningsYield: row.earnings_yield as number | null,
    dividendYield: row.dividend_yield as number | null,
    cape10yr: row.cape_10yr as number | null,

    grossProfitability: row.gross_profitability as number | null,
    roe: row.roe as number | null,
    roa: row.roa as number | null,
    assetGrowth: row.asset_growth as number | null,
    accrualsRatio: row.accruals_ratio as number | null,
    cashFlowQuality: row.cash_flow_quality as number | null,
    beneishMScore: row.beneish_m_score as number | null,

    marketCap: row.market_cap as number | null,
    sector: row.sector as string | null,
    industry: row.industry as string | null,

    source: row.source as string,
    computedAt: row.computed_at as string,
  };
}

// ============================================
// Repository
// ============================================

export class FundamentalsRepository {
  constructor(private client: TursoClient) {}

  /**
   * Create a new fundamental indicators record
   */
  async create(input: CreateFundamentalIndicatorsInput): Promise<FundamentalIndicators> {
    try {
      await this.client.run(
        `INSERT INTO fundamental_indicators (
          id, symbol, date,
          pe_ratio_ttm, pe_ratio_forward, pb_ratio, ev_ebitda,
          earnings_yield, dividend_yield, cape_10yr,
          gross_profitability, roe, roa, asset_growth,
          accruals_ratio, cash_flow_quality, beneish_m_score,
          market_cap, sector, industry, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.symbol,
          input.date,
          input.peRatioTtm ?? null,
          input.peRatioForward ?? null,
          input.pbRatio ?? null,
          input.evEbitda ?? null,
          input.earningsYield ?? null,
          input.dividendYield ?? null,
          input.cape10yr ?? null,
          input.grossProfitability ?? null,
          input.roe ?? null,
          input.roa ?? null,
          input.assetGrowth ?? null,
          input.accrualsRatio ?? null,
          input.cashFlowQuality ?? null,
          input.beneishMScore ?? null,
          input.marketCap ?? null,
          input.sector ?? null,
          input.industry ?? null,
          input.source ?? "FMP",
        ]
      );

      const result = await this.findById(input.id);
      if (!result) {
        throw RepositoryError.notFound("fundamental_indicators", input.id);
      }
      return result;
    } catch (error) {
      throw RepositoryError.fromSqliteError("fundamental_indicators", error as Error);
    }
  }

  /**
   * Create or update (upsert) fundamental indicators
   */
  async upsert(input: CreateFundamentalIndicatorsInput): Promise<FundamentalIndicators> {
    try {
      await this.client.run(
        `INSERT INTO fundamental_indicators (
          id, symbol, date,
          pe_ratio_ttm, pe_ratio_forward, pb_ratio, ev_ebitda,
          earnings_yield, dividend_yield, cape_10yr,
          gross_profitability, roe, roa, asset_growth,
          accruals_ratio, cash_flow_quality, beneish_m_score,
          market_cap, sector, industry, source, computed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(symbol, date) DO UPDATE SET
          pe_ratio_ttm = excluded.pe_ratio_ttm,
          pe_ratio_forward = excluded.pe_ratio_forward,
          pb_ratio = excluded.pb_ratio,
          ev_ebitda = excluded.ev_ebitda,
          earnings_yield = excluded.earnings_yield,
          dividend_yield = excluded.dividend_yield,
          cape_10yr = excluded.cape_10yr,
          gross_profitability = excluded.gross_profitability,
          roe = excluded.roe,
          roa = excluded.roa,
          asset_growth = excluded.asset_growth,
          accruals_ratio = excluded.accruals_ratio,
          cash_flow_quality = excluded.cash_flow_quality,
          beneish_m_score = excluded.beneish_m_score,
          market_cap = excluded.market_cap,
          sector = excluded.sector,
          industry = excluded.industry,
          source = excluded.source,
          computed_at = datetime('now')`,
        [
          input.id,
          input.symbol,
          input.date,
          input.peRatioTtm ?? null,
          input.peRatioForward ?? null,
          input.pbRatio ?? null,
          input.evEbitda ?? null,
          input.earningsYield ?? null,
          input.dividendYield ?? null,
          input.cape10yr ?? null,
          input.grossProfitability ?? null,
          input.roe ?? null,
          input.roa ?? null,
          input.assetGrowth ?? null,
          input.accrualsRatio ?? null,
          input.cashFlowQuality ?? null,
          input.beneishMScore ?? null,
          input.marketCap ?? null,
          input.sector ?? null,
          input.industry ?? null,
          input.source ?? "FMP",
        ]
      );

      const result = await this.findBySymbolAndDate(input.symbol, input.date);
      if (!result) {
        throw RepositoryError.notFound("fundamental_indicators", `${input.symbol}/${input.date}`);
      }
      return result;
    } catch (error) {
      throw RepositoryError.fromSqliteError("fundamental_indicators", error as Error);
    }
  }

  /**
   * Bulk upsert fundamental indicators
   */
  async bulkUpsert(inputs: CreateFundamentalIndicatorsInput[]): Promise<number> {
    if (inputs.length === 0) return 0;

    try {
      let upserted = 0;

      for (const input of inputs) {
        await this.upsert(input);
        upserted++;
      }

      return upserted;
    } catch (error) {
      throw RepositoryError.fromSqliteError("fundamental_indicators", error as Error);
    }
  }

  /**
   * Find by ID
   */
  async findById(id: string): Promise<FundamentalIndicators | null> {
    const row = await this.client.get<Row>("SELECT * FROM fundamental_indicators WHERE id = ?", [
      id,
    ]);
    return row ? mapRow(row) : null;
  }

  /**
   * Find by ID or throw
   */
  async findByIdOrThrow(id: string): Promise<FundamentalIndicators> {
    const result = await this.findById(id);
    if (!result) {
      throw RepositoryError.notFound("fundamental_indicators", id);
    }
    return result;
  }

  /**
   * Find by symbol and date
   */
  async findBySymbolAndDate(symbol: string, date: string): Promise<FundamentalIndicators | null> {
    const row = await this.client.get<Row>(
      "SELECT * FROM fundamental_indicators WHERE symbol = ? AND date = ?",
      [symbol, date]
    );
    return row ? mapRow(row) : null;
  }

  /**
   * Find latest fundamental indicators for a symbol
   */
  async findLatestBySymbol(symbol: string): Promise<FundamentalIndicators | null> {
    const row = await this.client.get<Row>(
      "SELECT * FROM fundamental_indicators WHERE symbol = ? ORDER BY date DESC LIMIT 1",
      [symbol]
    );
    return row ? mapRow(row) : null;
  }

  /**
   * Find latest fundamental indicators for multiple symbols
   */
  async findLatestBySymbols(symbols: string[]): Promise<FundamentalIndicators[]> {
    if (symbols.length === 0) return [];

    const placeholders = symbols.map(() => "?").join(", ");
    const rows = await this.client.execute<Row>(
      `SELECT f1.*
       FROM fundamental_indicators f1
       INNER JOIN (
         SELECT symbol, MAX(date) as max_date
         FROM fundamental_indicators
         WHERE symbol IN (${placeholders})
         GROUP BY symbol
       ) f2 ON f1.symbol = f2.symbol AND f1.date = f2.max_date`,
      symbols
    );
    return rows.map(mapRow);
  }

  /**
   * Find fundamental indicators by symbol with date range
   */
  async findBySymbol(
    symbol: string,
    filters?: { startDate?: string; endDate?: string }
  ): Promise<FundamentalIndicators[]> {
    let sql = "SELECT * FROM fundamental_indicators WHERE symbol = ?";
    const args: unknown[] = [symbol];

    if (filters?.startDate) {
      sql += " AND date >= ?";
      args.push(filters.startDate);
    }

    if (filters?.endDate) {
      sql += " AND date <= ?";
      args.push(filters.endDate);
    }

    sql += " ORDER BY date DESC";

    const rows = await this.client.execute<Row>(sql, args);
    return rows.map(mapRow);
  }

  /**
   * Find many with filters and pagination
   */
  async findMany(
    filters?: FundamentalFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<FundamentalIndicators>> {
    let sql = "SELECT * FROM fundamental_indicators WHERE 1=1";
    const args: unknown[] = [];

    if (filters?.symbol) {
      sql += " AND symbol = ?";
      args.push(filters.symbol);
    }

    if (filters?.symbols && filters.symbols.length > 0) {
      const placeholders = filters.symbols.map(() => "?").join(", ");
      sql += ` AND symbol IN (${placeholders})`;
      args.push(...filters.symbols);
    }

    if (filters?.sector) {
      sql += " AND sector = ?";
      args.push(filters.sector);
    }

    if (filters?.industry) {
      sql += " AND industry = ?";
      args.push(filters.industry);
    }

    if (filters?.startDate) {
      sql += " AND date >= ?";
      args.push(filters.startDate);
    }

    if (filters?.endDate) {
      sql += " AND date <= ?";
      args.push(filters.endDate);
    }

    sql += " ORDER BY date DESC, symbol ASC";

    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count");

    const result = await paginate<Row>(this.client, sql, countSql, args, pagination);

    return {
      ...result,
      data: result.data.map(mapRow),
    };
  }

  /**
   * Find by sector
   */
  async findBySector(sector: string, date?: string): Promise<FundamentalIndicators[]> {
    let sql: string;
    let args: unknown[];

    if (date) {
      sql = "SELECT * FROM fundamental_indicators WHERE sector = ? AND date = ? ORDER BY symbol";
      args = [sector, date];
    } else {
      // Get latest for each symbol in sector
      sql = `SELECT f1.*
             FROM fundamental_indicators f1
             INNER JOIN (
               SELECT symbol, MAX(date) as max_date
               FROM fundamental_indicators
               WHERE sector = ?
               GROUP BY symbol
             ) f2 ON f1.symbol = f2.symbol AND f1.date = f2.max_date
             ORDER BY f1.symbol`;
      args = [sector];
    }

    const rows = await this.client.execute<Row>(sql, args);
    return rows.map(mapRow);
  }

  /**
   * Update fundamental indicators
   */
  async update(
    id: string,
    input: UpdateFundamentalIndicatorsInput
  ): Promise<FundamentalIndicators> {
    try {
      const sets: string[] = [];
      const args: unknown[] = [];

      if (input.peRatioTtm !== undefined) {
        sets.push("pe_ratio_ttm = ?");
        args.push(input.peRatioTtm);
      }
      if (input.peRatioForward !== undefined) {
        sets.push("pe_ratio_forward = ?");
        args.push(input.peRatioForward);
      }
      if (input.pbRatio !== undefined) {
        sets.push("pb_ratio = ?");
        args.push(input.pbRatio);
      }
      if (input.evEbitda !== undefined) {
        sets.push("ev_ebitda = ?");
        args.push(input.evEbitda);
      }
      if (input.earningsYield !== undefined) {
        sets.push("earnings_yield = ?");
        args.push(input.earningsYield);
      }
      if (input.dividendYield !== undefined) {
        sets.push("dividend_yield = ?");
        args.push(input.dividendYield);
      }
      if (input.cape10yr !== undefined) {
        sets.push("cape_10yr = ?");
        args.push(input.cape10yr);
      }
      if (input.grossProfitability !== undefined) {
        sets.push("gross_profitability = ?");
        args.push(input.grossProfitability);
      }
      if (input.roe !== undefined) {
        sets.push("roe = ?");
        args.push(input.roe);
      }
      if (input.roa !== undefined) {
        sets.push("roa = ?");
        args.push(input.roa);
      }
      if (input.assetGrowth !== undefined) {
        sets.push("asset_growth = ?");
        args.push(input.assetGrowth);
      }
      if (input.accrualsRatio !== undefined) {
        sets.push("accruals_ratio = ?");
        args.push(input.accrualsRatio);
      }
      if (input.cashFlowQuality !== undefined) {
        sets.push("cash_flow_quality = ?");
        args.push(input.cashFlowQuality);
      }
      if (input.beneishMScore !== undefined) {
        sets.push("beneish_m_score = ?");
        args.push(input.beneishMScore);
      }
      if (input.marketCap !== undefined) {
        sets.push("market_cap = ?");
        args.push(input.marketCap);
      }
      if (input.sector !== undefined) {
        sets.push("sector = ?");
        args.push(input.sector);
      }
      if (input.industry !== undefined) {
        sets.push("industry = ?");
        args.push(input.industry);
      }

      if (sets.length === 0) {
        return this.findByIdOrThrow(id);
      }

      sets.push("computed_at = datetime('now')");
      args.push(id);

      await this.client.run(
        `UPDATE fundamental_indicators SET ${sets.join(", ")} WHERE id = ?`,
        args
      );

      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("fundamental_indicators", error as Error);
    }
  }

  /**
   * Delete by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.client.run("DELETE FROM fundamental_indicators WHERE id = ?", [id]);
      return (result?.changes ?? 0) > 0;
    } catch (error) {
      throw RepositoryError.fromSqliteError("fundamental_indicators", error as Error);
    }
  }

  /**
   * Delete by symbol and date
   */
  async deleteBySymbolAndDate(symbol: string, date: string): Promise<boolean> {
    try {
      const result = await this.client.run(
        "DELETE FROM fundamental_indicators WHERE symbol = ? AND date = ?",
        [symbol, date]
      );
      return (result?.changes ?? 0) > 0;
    } catch (error) {
      throw RepositoryError.fromSqliteError("fundamental_indicators", error as Error);
    }
  }

  /**
   * Delete all data for a symbol
   */
  async deleteBySymbol(symbol: string): Promise<number> {
    try {
      const result = await this.client.run("DELETE FROM fundamental_indicators WHERE symbol = ?", [
        symbol,
      ]);
      return result?.changes ?? 0;
    } catch (error) {
      throw RepositoryError.fromSqliteError("fundamental_indicators", error as Error);
    }
  }

  /**
   * Delete old data before a date
   */
  async deleteOlderThan(date: string): Promise<number> {
    try {
      const result = await this.client.run("DELETE FROM fundamental_indicators WHERE date < ?", [
        date,
      ]);
      return result?.changes ?? 0;
    } catch (error) {
      throw RepositoryError.fromSqliteError("fundamental_indicators", error as Error);
    }
  }

  /**
   * Get distinct sectors
   */
  async getDistinctSectors(): Promise<string[]> {
    const rows = await this.client.execute<{ sector: string }>(
      "SELECT DISTINCT sector FROM fundamental_indicators WHERE sector IS NOT NULL ORDER BY sector"
    );
    return rows.map((r) => r.sector);
  }

  /**
   * Get distinct industries
   */
  async getDistinctIndustries(sector?: string): Promise<string[]> {
    let sql = "SELECT DISTINCT industry FROM fundamental_indicators WHERE industry IS NOT NULL";
    const args: unknown[] = [];

    if (sector) {
      sql += " AND sector = ?";
      args.push(sector);
    }

    sql += " ORDER BY industry";

    const rows = await this.client.execute<{ industry: string }>(sql, args);
    return rows.map((r) => r.industry);
  }

  /**
   * Get count of records
   */
  async count(filters?: FundamentalFilters): Promise<number> {
    let sql = "SELECT COUNT(*) as count FROM fundamental_indicators WHERE 1=1";
    const args: unknown[] = [];

    if (filters?.symbol) {
      sql += " AND symbol = ?";
      args.push(filters.symbol);
    }

    if (filters?.symbols && filters.symbols.length > 0) {
      const placeholders = filters.symbols.map(() => "?").join(", ");
      sql += ` AND symbol IN (${placeholders})`;
      args.push(...filters.symbols);
    }

    if (filters?.sector) {
      sql += " AND sector = ?";
      args.push(filters.sector);
    }

    if (filters?.startDate) {
      sql += " AND date >= ?";
      args.push(filters.startDate);
    }

    if (filters?.endDate) {
      sql += " AND date <= ?";
      args.push(filters.endDate);
    }

    const row = await this.client.get<{ count: number }>(sql, args);
    return row?.count ?? 0;
  }
}
