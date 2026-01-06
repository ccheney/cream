/**
 * Connection Pool Implementation
 *
 * Provides generic connection pooling for database and API connections.
 * Supports:
 * - Configurable pool size (min/max)
 * - Connection health checking
 * - Automatic connection recycling
 * - Idle connection timeout
 * - Connection acquisition timeout
 *
 * @example
 * ```typescript
 * const pool = createPool({
 *   create: async () => createConnection(),
 *   destroy: async (conn) => conn.close(),
 *   validate: async (conn) => conn.isValid(),
 *   min: 2,
 *   max: 10,
 * });
 *
 * const conn = await pool.acquire();
 * try {
 *   await conn.execute(query);
 * } finally {
 *   pool.release(conn);
 * }
 *
 * // Or with automatic release
 * const result = await pool.use(async (conn) => {
 *   return conn.execute(query);
 * });
 * ```
 */

// ============================================
// Types
// ============================================

/**
 * Pool statistics
 */
export interface PoolStats {
  /** Total connections created */
  totalCreated: number;
  /** Total connections destroyed */
  totalDestroyed: number;
  /** Currently active (in-use) connections */
  active: number;
  /** Currently idle (available) connections */
  idle: number;
  /** Total pool size (active + idle) */
  size: number;
  /** Pending acquisition requests */
  pending: number;
  /** Average acquisition time in ms */
  avgAcquisitionTime: number;
  /** Total failed health checks */
  healthCheckFailures: number;
}

/**
 * Pooled connection wrapper
 */
export interface PooledConnection<T> {
  /** The actual connection */
  connection: T;
  /** When the connection was created */
  createdAt: number;
  /** When the connection was last used */
  lastUsedAt: number;
  /** Number of times this connection has been used */
  useCount: number;
  /** Whether the connection is currently in use */
  inUse: boolean;
}

/**
 * Pool configuration
 */
export interface PoolConfig<T> {
  /**
   * Create a new connection
   */
  create: () => Promise<T>;

  /**
   * Destroy a connection
   */
  destroy: (connection: T) => Promise<void>;

  /**
   * Validate a connection is still healthy
   */
  validate?: (connection: T) => Promise<boolean>;

  /**
   * Minimum number of connections to maintain
   * @default 1
   */
  min?: number;

  /**
   * Maximum number of connections
   * @default 10
   */
  max?: number;

  /**
   * Idle timeout in milliseconds (connections idle longer than this are destroyed)
   * @default 30000 (30 seconds)
   */
  idleTimeout?: number;

  /**
   * Acquisition timeout in milliseconds (how long to wait for a connection)
   * @default 10000 (10 seconds)
   */
  acquireTimeout?: number;

  /**
   * Maximum connection age in milliseconds (connections older than this are recycled)
   * @default 600000 (10 minutes)
   */
  maxAge?: number;

  /**
   * Health check interval in milliseconds
   * @default 30000 (30 seconds)
   */
  healthCheckInterval?: number;

  /**
   * Pool name for logging and debugging
   */
  name?: string;
}

/**
 * Connection pool interface
 */
export interface ConnectionPool<T> {
  /** Acquire a connection from the pool */
  acquire(): Promise<T>;

  /** Release a connection back to the pool */
  release(connection: T): void;

  /**
   * Use a connection with automatic release
   *
   * @example
   * ```typescript
   * const result = await pool.use(async (conn) => {
   *   return conn.query("SELECT * FROM users");
   * });
   * ```
   */
  use<R>(fn: (connection: T) => Promise<R>): Promise<R>;

  /** Get pool statistics */
  getStats(): PoolStats;

  /** Close all connections and shutdown the pool */
  close(): Promise<void>;

  /** Check if pool is closed */
  isClosed(): boolean;
}

// ============================================
// Implementation
// ============================================

interface PendingAcquisition<T> {
  resolve: (connection: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Create a connection pool
 */
export function createPool<T>(config: PoolConfig<T>): ConnectionPool<T> {
  const {
    create,
    destroy,
    validate,
    min = 1,
    max = 10,
    idleTimeout = 30000,
    acquireTimeout = 10000,
    maxAge = 600000,
    healthCheckInterval = 30000,
    name = "pool",
  } = config;

  // Pool state
  const connections = new Map<T, PooledConnection<T>>();
  const available: T[] = [];
  const pending: PendingAcquisition<T>[] = [];
  let closed = false;
  let healthCheckTimer: ReturnType<typeof setInterval> | undefined;

  // Statistics
  let totalCreated = 0;
  let totalDestroyed = 0;
  let healthCheckFailures = 0;
  const acquisitionTimes: number[] = [];

  /**
   * Log message with pool name prefix
   */
  function log(_message: string, level: "info" | "warn" | "error" = "info"): void {
    const _prefix = `[${name}]`;
    if (level === "error") {
    } else if (level === "warn") {
    } else {
    }
  }

  /**
   * Create a new pooled connection
   */
  async function createConnection(): Promise<T> {
    const connection = await create();
    const pooledConnection: PooledConnection<T> = {
      connection,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 0,
      inUse: false,
    };
    connections.set(connection, pooledConnection);
    totalCreated++;
    log(`Created connection (total: ${connections.size})`);
    return connection;
  }

  /**
   * Destroy a connection
   */
  async function destroyConnection(connection: T): Promise<void> {
    connections.delete(connection);
    const availableIndex = available.indexOf(connection);
    if (availableIndex >= 0) {
      available.splice(availableIndex, 1);
    }
    try {
      await destroy(connection);
      totalDestroyed++;
      log(`Destroyed connection (total: ${connections.size})`);
    } catch (err) {
      log(`Failed to destroy connection: ${err}`, "error");
    }
  }

  /**
   * Check if a connection should be recycled
   */
  function shouldRecycle(pooled: PooledConnection<T>): boolean {
    const now = Date.now();
    const age = now - pooled.createdAt;
    const idleTime = now - pooled.lastUsedAt;

    // Recycle if too old
    if (age > maxAge) {
      return true;
    }

    // Recycle if idle too long and we're above minimum
    if (idleTime > idleTimeout && connections.size > min) {
      return true;
    }

    return false;
  }

  /**
   * Validate a connection is healthy
   */
  async function validateConnection(connection: T): Promise<boolean> {
    if (!validate) {
      return true;
    }

    try {
      return await validate(connection);
    } catch {
      return false;
    }
  }

  /**
   * Get an available connection or create a new one
   */
  async function getConnection(): Promise<T> {
    // Try to get an available connection
    while (available.length > 0) {
      const connection = available.pop()!;
      const pooled = connections.get(connection);

      if (!pooled) {
        continue;
      }

      // Check if connection should be recycled
      if (shouldRecycle(pooled)) {
        await destroyConnection(connection);
        continue;
      }

      // Validate connection health
      const isValid = await validateConnection(connection);
      if (!isValid) {
        healthCheckFailures++;
        log(`Connection failed health check`, "warn");
        await destroyConnection(connection);
        continue;
      }

      // Mark as in use
      pooled.inUse = true;
      pooled.lastUsedAt = Date.now();
      pooled.useCount++;

      return connection;
    }

    // Create new connection if under max
    if (connections.size < max) {
      const connection = await createConnection();
      const pooled = connections.get(connection)!;
      pooled.inUse = true;
      pooled.useCount++;
      return connection;
    }

    // No connection available and at max capacity
    throw new Error("Pool at max capacity");
  }

  /**
   * Initialize minimum connections
   */
  async function initialize(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < min; i++) {
      promises.push(
        createConnection().then((conn) => {
          available.push(conn);
        })
      );
    }
    await Promise.all(promises);
    log(`Initialized with ${min} connections`);
  }

  /**
   * Run periodic health check
   */
  async function runHealthCheck(): Promise<void> {
    if (closed) {
      return;
    }

    // Check idle connections
    const connectionsToCheck = [...available];
    for (const connection of connectionsToCheck) {
      const pooled = connections.get(connection);
      if (!pooled) {
        continue;
      }

      // Check if should recycle
      if (shouldRecycle(pooled)) {
        await destroyConnection(connection);
        continue;
      }

      // Validate health
      const isValid = await validateConnection(connection);
      if (!isValid) {
        healthCheckFailures++;
        log(`Connection failed periodic health check`, "warn");
        await destroyConnection(connection);
      }
    }

    // Ensure minimum connections
    while (connections.size < min && !closed) {
      try {
        const conn = await createConnection();
        available.push(conn);
      } catch (err) {
        log(`Failed to create connection: ${err}`, "error");
        break;
      }
    }
  }

  /**
   * Process pending acquisition requests
   */
  function processPending(): void {
    while (pending.length > 0 && available.length > 0) {
      const request = pending.shift()!;
      clearTimeout(request.timer);

      const connection = available.pop()!;
      const pooled = connections.get(connection);

      if (pooled) {
        pooled.inUse = true;
        pooled.lastUsedAt = Date.now();
        pooled.useCount++;
        request.resolve(connection);
      } else {
        // Connection was destroyed, try again
        pending.unshift(request);
      }
    }
  }

  // Start health check timer
  healthCheckTimer = setInterval(() => {
    runHealthCheck().catch((err) => {
      log(`Health check failed: ${err}`, "error");
    });
  }, healthCheckInterval);

  // Initialize pool asynchronously
  initialize().catch((err) => {
    log(`Failed to initialize pool: ${err}`, "error");
  });

  return {
    async acquire(): Promise<T> {
      if (closed) {
        throw new Error("Pool is closed");
      }

      const startTime = Date.now();

      try {
        const connection = await getConnection();
        acquisitionTimes.push(Date.now() - startTime);
        if (acquisitionTimes.length > 100) {
          acquisitionTimes.shift();
        }
        return connection;
      } catch {
        // At max capacity, wait for a connection
        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => {
            const index = pending.findIndex((p) => p.resolve === resolve && p.reject === reject);
            if (index >= 0) {
              pending.splice(index, 1);
            }
            reject(new Error(`Acquire timeout after ${acquireTimeout}ms`));
          }, acquireTimeout);

          pending.push({ resolve, reject, timer });
        });
      }
    },

    release(connection: T): void {
      if (closed) {
        // Destroy connection since pool is closed
        destroyConnection(connection).catch((err) => {
          log(`Failed to destroy released connection: ${err}`, "error");
        });
        return;
      }

      const pooled = connections.get(connection);
      if (!pooled) {
        log("Attempted to release unknown connection", "warn");
        return;
      }

      pooled.inUse = false;
      pooled.lastUsedAt = Date.now();

      // Check if should recycle
      if (shouldRecycle(pooled)) {
        destroyConnection(connection).catch((err) => {
          log(`Failed to destroy recycled connection: ${err}`, "error");
        });
      } else {
        available.push(connection);
        processPending();
      }
    },

    async use<R>(fn: (connection: T) => Promise<R>): Promise<R> {
      const connection = await this.acquire();
      try {
        return await fn(connection);
      } finally {
        this.release(connection);
      }
    },

    getStats(): PoolStats {
      const activeCount = [...connections.values()].filter((p) => p.inUse).length;
      const avgAcquisitionTime =
        acquisitionTimes.length > 0
          ? acquisitionTimes.reduce((a, b) => a + b, 0) / acquisitionTimes.length
          : 0;

      return {
        totalCreated,
        totalDestroyed,
        active: activeCount,
        idle: available.length,
        size: connections.size,
        pending: pending.length,
        avgAcquisitionTime,
        healthCheckFailures,
      };
    },

    async close(): Promise<void> {
      if (closed) {
        return;
      }

      closed = true;
      log("Closing pool...");

      // Clear health check timer
      if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
      }

      // Reject pending requests
      for (const request of pending) {
        clearTimeout(request.timer);
        request.reject(new Error("Pool is closing"));
      }
      pending.length = 0;

      // Destroy all connections
      const destroyPromises = [...connections.keys()].map((conn) => destroyConnection(conn));
      await Promise.all(destroyPromises);

      log("Pool closed");
    },

    isClosed(): boolean {
      return closed;
    },
  };
}

// ============================================
// Specialized Pools
// ============================================

/**
 * Create a Turso connection pool
 *
 * Note: SQLite (which Turso is based on) has a single-writer limitation.
 * This pool is primarily useful for:
 * - Reusing prepared statements
 * - Managing read concurrency
 * - Connection health monitoring
 *
 * @param config Turso configuration
 * @param poolConfig Pool configuration overrides
 */
export async function createTursoPool(
  createClient: () => Promise<{
    execute: (sql: string, args?: unknown[]) => Promise<unknown[]>;
    close: () => void | Promise<void>;
  }>,
  poolConfig: Partial<
    Omit<
      PoolConfig<ReturnType<typeof createClient> extends Promise<infer T> ? T : never>,
      "create" | "destroy"
    >
  > = {}
): Promise<ConnectionPool<Awaited<ReturnType<typeof createClient>>>> {
  type ClientType = Awaited<ReturnType<typeof createClient>>;

  return createPool<ClientType>({
    create: createClient,
    destroy: async (client) => {
      await client.close();
    },
    validate: async (client) => {
      try {
        await client.execute("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    name: "turso",
    min: 1,
    max: 3, // SQLite doesn't benefit much from many connections
    ...poolConfig,
  });
}

/**
 * HTTP connection pool for API clients
 *
 * Uses a simple counter-based approach since HTTP connections
 * are typically managed by the underlying HTTP client library.
 */
export interface HttpPoolConfig {
  /** Maximum concurrent requests */
  maxConcurrent?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Pool name for logging */
  name?: string;
}

export interface HttpPool {
  /** Execute a function with rate limiting */
  execute<T>(fn: () => Promise<T>): Promise<T>;
  /** Get current statistics */
  getStats(): { active: number; pending: number; maxConcurrent: number };
  /** Close the pool */
  close(): void;
}

/**
 * Create an HTTP connection pool
 *
 * This provides concurrency limiting for HTTP-based API clients.
 */
export function createHttpPool(config: HttpPoolConfig = {}): HttpPool {
  const { maxConcurrent = 10, timeout = 30000, name = "http" } = config;

  let active = 0;
  let closed = false;
  const pending: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  function processPending(): void {
    while (pending.length > 0 && active < maxConcurrent) {
      const request = pending.shift()!;
      clearTimeout(request.timer);
      active++;

      request
        .fn()
        .then((result) => {
          request.resolve(result);
        })
        .catch((err) => {
          request.reject(err);
        })
        .finally(() => {
          active--;
          processPending();
        });
    }
  }

  return {
    execute<T>(fn: () => Promise<T>): Promise<T> {
      if (closed) {
        return Promise.reject(new Error("Pool is closed"));
      }

      if (active < maxConcurrent) {
        active++;
        return fn().finally(() => {
          active--;
          processPending();
        });
      }

      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = pending.findIndex((p) => p.resolve === resolve && p.reject === reject);
          if (index >= 0) {
            pending.splice(index, 1);
          }
          reject(new Error(`[${name}] Request timeout after ${timeout}ms`));
        }, timeout);

        pending.push({
          fn: fn as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
          timer,
        });
      });
    },

    getStats(): { active: number; pending: number; maxConcurrent: number } {
      return { active, pending: pending.length, maxConcurrent };
    },

    close(): void {
      closed = true;
      for (const request of pending) {
        clearTimeout(request.timer);
        request.reject(new Error("Pool is closing"));
      }
      pending.length = 0;
    },
  };
}
