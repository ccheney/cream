/**
 * Mock Turso/LibSQL Client
 *
 * In-memory SQL database for testing.
 * Simulates Turso behavior using Map-based storage.
 *
 * @see docs/plans/14-testing.md for mocking strategy
 */

// ============================================
// Types
// ============================================

/**
 * Result set from a query
 */
export interface ResultSet {
  columns: string[];
  rows: unknown[][];
  rowsAffected: number;
  lastInsertRowid?: bigint;
}

/**
 * Transaction interface
 */
export interface Transaction {
  execute(sql: string, args?: unknown[]): Promise<ResultSet>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Mock Turso configuration
 */
export interface MockTursoConfig {
  /** Simulated query delay (ms) */
  queryDelay?: number;
  /** Simulate failures */
  simulateFailure?: boolean;
  /** Failure type */
  failureType?: "CONNECTION" | "QUERY" | "CONSTRAINT";
  /** Use deterministic behavior */
  deterministic?: boolean;
}

/**
 * Table schema for storage
 */
interface TableSchema {
  name: string;
  columns: string[];
  primaryKey?: string;
}

/**
 * Row data
 */
type Row = Record<string, unknown>;

// ============================================
// Mock Turso Client
// ============================================

/**
 * Mock Turso Client
 *
 * In-memory SQL database for testing:
 * - Table creation and management
 * - Basic CRUD operations
 * - Transaction support (simplified)
 * - Batch execution
 */
export class MockTursoClient {
  private tables: Map<string, Row[]> = new Map();
  private schemas: Map<string, TableSchema> = new Map();
  private config: Required<MockTursoConfig>;
  private inTransaction = false;
  private transactionBuffer: Row[][] = [];

  constructor(config: MockTursoConfig = {}) {
    this.config = {
      queryDelay: config.queryDelay ?? 5,
      simulateFailure: config.simulateFailure ?? false,
      failureType: config.failureType ?? "QUERY",
      deterministic: config.deterministic ?? true,
    };
  }

  // ============================================
  // Query Execution
  // ============================================

  /**
   * Execute a SQL statement
   */
  async execute(sql: string, args: unknown[] = []): Promise<ResultSet> {
    await this.simulateDelay();
    this.checkFailure();

    const normalized = sql.trim().toUpperCase();

    // Parse and execute different statement types
    if (normalized.startsWith("CREATE TABLE")) {
      return this.executeCreateTable(sql);
    }
    if (normalized.startsWith("INSERT")) {
      return this.executeInsert(sql, args);
    }
    if (normalized.startsWith("SELECT")) {
      return this.executeSelect(sql, args);
    }
    if (normalized.startsWith("UPDATE")) {
      return this.executeUpdate(sql, args);
    }
    if (normalized.startsWith("DELETE")) {
      return this.executeDelete(sql, args);
    }
    if (normalized.startsWith("DROP TABLE")) {
      return this.executeDropTable(sql);
    }

    // Unknown statement - return empty result
    return { columns: [], rows: [], rowsAffected: 0 };
  }

  /**
   * Execute a batch of statements
   */
  async batch(
    statements: Array<{ sql: string; args?: unknown[] }>
  ): Promise<ResultSet[]> {
    const results: ResultSet[] = [];
    for (const stmt of statements) {
      results.push(await this.execute(stmt.sql, stmt.args ?? []));
    }
    return results;
  }

  /**
   * Begin a transaction
   */
  async transaction(): Promise<Transaction> {
    this.inTransaction = true;
    this.transactionBuffer = [];

    // Save current state for rollback
    const savedState = new Map<string, Row[]>();
    for (const [name, rows] of this.tables.entries()) {
      savedState.set(name, rows.map((r) => ({ ...r })));
    }

    const self = this;

    return {
      async execute(sql: string, args?: unknown[]): Promise<ResultSet> {
        return self.execute(sql, args ?? []);
      },
      async commit(): Promise<void> {
        self.inTransaction = false;
        self.transactionBuffer = [];
      },
      async rollback(): Promise<void> {
        self.inTransaction = false;
        self.transactionBuffer = [];
        // Restore saved state
        self.tables = savedState;
      },
      async close(): Promise<void> {
        self.inTransaction = false;
      },
    };
  }

  // ============================================
  // Statement Execution
  // ============================================

  /**
   * Execute CREATE TABLE
   */
  private executeCreateTable(sql: string): ResultSet {
    // Parse table name: CREATE TABLE [IF NOT EXISTS] name (...)
    const match = sql.match(
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?(\w+)["']?\s*\(/i
    );
    if (!match) {
      throw new Error(`Invalid CREATE TABLE: ${sql}`);
    }

    const tableName = match[1].toLowerCase();

    // Parse columns (simplified)
    const columnsMatch = sql.match(/\(([^)]+)\)/);
    if (columnsMatch) {
      const columnDefs = columnsMatch[1].split(",").map((c) => c.trim());
      const columns = columnDefs.map((def) => {
        const parts = def.split(/\s+/);
        return parts[0].replace(/["']/g, "").toLowerCase();
      });

      this.schemas.set(tableName, {
        name: tableName,
        columns,
        primaryKey: columns.find((c) => c === "id"),
      });
    }

    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, []);
    }

    return { columns: [], rows: [], rowsAffected: 0 };
  }

  /**
   * Execute INSERT
   */
  private executeInsert(sql: string, args: unknown[]): ResultSet {
    // Parse: INSERT INTO table (col1, col2) VALUES (?, ?)
    const match = sql.match(
      /INSERT INTO\s+["']?(\w+)["']?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
    );
    if (!match) {
      throw new Error(`Invalid INSERT: ${sql}`);
    }

    const tableName = match[1].toLowerCase();
    const columns = match[2].split(",").map((c) => c.trim().toLowerCase());

    // Get or create table
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, []);
    }
    const table = this.tables.get(tableName)!;

    // Create row
    const row: Row = {};
    for (let i = 0; i < columns.length; i++) {
      row[columns[i]] = args[i];
    }

    table.push(row);

    return {
      columns: [],
      rows: [],
      rowsAffected: 1,
      lastInsertRowid: BigInt(table.length),
    };
  }

  /**
   * Execute SELECT
   */
  private executeSelect(sql: string, args: unknown[]): ResultSet {
    // Parse: SELECT col1, col2 FROM table [WHERE ...]
    const match = sql.match(
      /SELECT\s+(.+?)\s+FROM\s+["']?(\w+)["']?(?:\s+WHERE\s+(.+))?/i
    );
    if (!match) {
      return { columns: [], rows: [], rowsAffected: 0 };
    }

    const columnsStr = match[1];
    const tableName = match[2].toLowerCase();
    const whereClause = match[3];

    const table = this.tables.get(tableName);
    if (!table) {
      return { columns: [], rows: [], rowsAffected: 0 };
    }

    // Determine columns
    let columns: string[];
    if (columnsStr.trim() === "*") {
      const schema = this.schemas.get(tableName);
      columns = schema?.columns ?? Object.keys(table[0] ?? {});
    } else {
      columns = columnsStr.split(",").map((c) => c.trim().toLowerCase());
    }

    // Filter rows
    let rows = [...table];
    if (whereClause) {
      rows = this.applyWhere(rows, whereClause, args);
    }

    // Project columns
    const resultRows = rows.map((row) =>
      columns.map((col) => row[col] ?? null)
    );

    return {
      columns,
      rows: resultRows,
      rowsAffected: resultRows.length,
    };
  }

  /**
   * Execute UPDATE
   */
  private executeUpdate(sql: string, args: unknown[]): ResultSet {
    // Parse: UPDATE table SET col1 = ? [WHERE ...]
    const match = sql.match(
      /UPDATE\s+["']?(\w+)["']?\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i
    );
    if (!match) {
      throw new Error(`Invalid UPDATE: ${sql}`);
    }

    const tableName = match[1].toLowerCase();
    const setClause = match[2];
    const whereClause = match[3];

    const table = this.tables.get(tableName);
    if (!table) {
      return { columns: [], rows: [], rowsAffected: 0 };
    }

    // Parse SET clause
    const setParts = setClause.split(",").map((s) => s.trim());
    const updates: Record<string, unknown> = {};
    let argIndex = 0;

    for (const part of setParts) {
      const [col, _val] = part.split("=").map((p) => p.trim());
      updates[col.toLowerCase()] = args[argIndex++];
    }

    // Filter and update rows
    let rowsAffected = 0;
    for (let i = 0; i < table.length; i++) {
      const row = table[i];
      if (!whereClause || this.matchesWhere(row, whereClause, args.slice(argIndex))) {
        for (const [col, val] of Object.entries(updates)) {
          row[col] = val;
        }
        rowsAffected++;
      }
    }

    return { columns: [], rows: [], rowsAffected };
  }

  /**
   * Execute DELETE
   */
  private executeDelete(sql: string, args: unknown[]): ResultSet {
    // Parse: DELETE FROM table [WHERE ...]
    const match = sql.match(
      /DELETE FROM\s+["']?(\w+)["']?(?:\s+WHERE\s+(.+))?/i
    );
    if (!match) {
      throw new Error(`Invalid DELETE: ${sql}`);
    }

    const tableName = match[1].toLowerCase();
    const whereClause = match[2];

    const table = this.tables.get(tableName);
    if (!table) {
      return { columns: [], rows: [], rowsAffected: 0 };
    }

    // Filter and delete rows
    const initialLength = table.length;
    const filtered = whereClause
      ? table.filter((row) => !this.matchesWhere(row, whereClause, args))
      : [];

    this.tables.set(tableName, filtered);

    return {
      columns: [],
      rows: [],
      rowsAffected: initialLength - filtered.length,
    };
  }

  /**
   * Execute DROP TABLE
   */
  private executeDropTable(sql: string): ResultSet {
    const match = sql.match(/DROP TABLE\s+(?:IF EXISTS\s+)?["']?(\w+)["']?/i);
    if (!match) {
      throw new Error(`Invalid DROP TABLE: ${sql}`);
    }

    const tableName = match[1].toLowerCase();
    this.tables.delete(tableName);
    this.schemas.delete(tableName);

    return { columns: [], rows: [], rowsAffected: 0 };
  }

  // ============================================
  // WHERE Clause Helpers
  // ============================================

  /**
   * Apply WHERE clause to filter rows
   */
  private applyWhere(
    rows: Row[],
    whereClause: string,
    args: unknown[]
  ): Row[] {
    return rows.filter((row) => this.matchesWhere(row, whereClause, args));
  }

  /**
   * Check if a row matches the WHERE clause
   */
  private matchesWhere(
    row: Row,
    whereClause: string,
    args: unknown[]
  ): boolean {
    // Simplified WHERE parsing: col = ?
    const match = whereClause.match(/(\w+)\s*=\s*\?/);
    if (match) {
      const col = match[1].toLowerCase();
      return row[col] === args[0];
    }

    // More complex patterns would need more parsing
    return true;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    // No-op for mock
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.tables.clear();
    this.schemas.clear();
    this.inTransaction = false;
    this.transactionBuffer = [];
  }

  /**
   * Get table data (for testing)
   */
  getTable(name: string): Row[] {
    return this.tables.get(name.toLowerCase()) ?? [];
  }

  /**
   * Set table data (for testing)
   */
  setTable(name: string, rows: Row[]): void {
    this.tables.set(name.toLowerCase(), rows);
  }

  /**
   * Get all table names
   */
  getTableNames(): string[] {
    return Array.from(this.tables.keys());
  }

  /**
   * Simulate query delay
   */
  private async simulateDelay(): Promise<void> {
    if (this.config.queryDelay > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.queryDelay)
      );
    }
  }

  /**
   * Check and throw failure if configured
   */
  private checkFailure(): void {
    if (this.config.simulateFailure) {
      throw new Error(`MockTurso: ${this.config.failureType} error`);
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a mock Turso client
 */
export function createMockTurso(config?: MockTursoConfig): MockTursoClient {
  return new MockTursoClient(config);
}
