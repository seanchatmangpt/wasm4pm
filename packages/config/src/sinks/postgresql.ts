/**
 * PostgreSQL Sink
 *
 * Exports process mining results to a PostgreSQL database.
 * Stores metrics: run_id, algorithm, log_size, fitness, precision, timestamp.
 */

import type { Receipt, ExecutionSummary } from '@wasm4pm/contracts';

export interface PostgresqlConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  table?: string;
  poolSize?: number;
}

/** Minimal interface for the pg Pool that PostgresqlSink needs. */
export interface PgPoolLike {
  connect(): Promise<{ release(): void }>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export interface PostgresqlSinkOptions {
  config: PostgresqlConfig;
  /**
   * Optional connection pool instance (for testing/reuse).
   * If not provided, a new pool will be created from the optional `pg` peer dep.
   */
  pool?: PgPoolLike;
}

export interface PostgresqlMetrics {
  run_id: string;
  algorithm: string;
  log_size: number;
  fitness?: number;
  precision?: number;
  timestamp: string;
  // Allow additional columns for forward-compatibility with schema evolution.
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Validate that a PostgreSQL identifier (table name or column name) contains only
 * safe characters: letters, digits, and underscores, starting with a letter or
 * underscore.  Prevents SQL injection via user-supplied table/column names.
 *
 * Throws if the identifier is invalid.
 */
function assertSafeIdentifier(identifier: string, kind: 'table' | 'column'): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(
      `Invalid PostgreSQL ${kind} name: "${identifier}". ` +
        `Only letters, digits, and underscores are allowed, starting with a letter or underscore.`
    );
  }
}

/**
 * PostgreSQL Sink — stores metrics in a database table
 */
export class PostgresqlSink {
  private config: PostgresqlConfig;
  private pool: PgPoolLike | undefined;
  private tableName: string;
  private initialized: boolean = false;

  constructor(options: PostgresqlSinkOptions) {
    this.config = options.config;
    this.pool = options.pool;
    const rawTable = options.config.table || 'wasm4pm_runs';
    // SECURITY: validate table name before it reaches any SQL string (SQL injection guard).
    assertSafeIdentifier(rawTable, 'table');
    this.tableName = rawTable;
  }

  /**
   * Initialize the database connection and ensure schema exists
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.pool) {
      // Lazy-load pg only if needed (not imported at module level)
      try {
        const pg = await import('pg') as { Pool: new (opts: Record<string, unknown>) => PgPoolLike };
        const { Pool } = pg;
        this.pool = new Pool({
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          user: this.config.user,
          password: this.config.password,
          max: this.config.poolSize || 10,
        });
      } catch (error) {
        throw new Error(
          `Failed to initialize PostgreSQL pool: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Test the connection
    try {
      const client = await this.pool!.connect();
      await client.release();
    } catch (error) {
      throw new Error(
        `Failed to connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Ensure schema exists
    await this.ensureSchema();
    this.initialized = true;
  }

  /**
   * Ensure the wasm4pm_runs table exists
   */
  private async ensureSchema(): Promise<void> {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(64) UNIQUE NOT NULL,
        algorithm VARCHAR(255) NOT NULL,
        log_size INTEGER NOT NULL,
        fitness DECIMAL(5,4),
        precision DECIMAL(5,4),
        timestamp TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_run_id (run_id),
        INDEX idx_algorithm (algorithm),
        INDEX idx_timestamp (timestamp)
      );
    `;

    try {
      await this.pool!.query(createTableSql);
    } catch (error) {
      // PostgreSQL uses different syntax than the SQL above
      // Check if error is about table already existing
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Write metrics to the PostgreSQL database
   */
  async write(metrics: PostgresqlMetrics): Promise<void> {
    await this.initialize();

    const columns = Object.keys(metrics).sort();
    // SECURITY: validate every column name against the safe-identifier regex before
    // interpolating into SQL.  The PostgresqlMetrics type has an open index signature
    // ([key: string]) so callers could supply arbitrary column names.
    for (const col of columns) {
      assertSafeIdentifier(col, 'column');
    }
    const placeholders = columns
      .map((_, i) => `$${i + 1}`)
      .join(', ');
    const values = columns.map((col) => metrics[col as keyof PostgresqlMetrics]);

    const insertSql = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (run_id) DO UPDATE SET
        algorithm = EXCLUDED.algorithm,
        log_size = EXCLUDED.log_size,
        fitness = EXCLUDED.fitness,
        precision = EXCLUDED.precision,
        timestamp = EXCLUDED.timestamp;
    `;

    try {
      await this.pool!.query(insertSql, values);
    } catch (error) {
      throw new Error(
        `Failed to write metrics to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate the configuration
   */
  static validateConfig(config: PostgresqlConfig): string[] {
    const errors: string[] = [];

    if (!config.host || config.host.trim().length === 0) {
      errors.push('PostgreSQL host is required');
    }
    if (config.port <= 0 || config.port > 65535) {
      errors.push('PostgreSQL port must be between 1 and 65535');
    }
    if (!config.database || config.database.trim().length === 0) {
      errors.push('PostgreSQL database name is required');
    }
    if (!config.user || config.user.trim().length === 0) {
      errors.push('PostgreSQL user is required');
    }
    if (config.poolSize && config.poolSize < 1) {
      errors.push('PostgreSQL pool size must be at least 1');
    }

    return errors;
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Query results from the database
   */
  async query(sql: string, values?: unknown[]): Promise<unknown[]> {
    await this.initialize();
    // After initialize(), pool is always defined
    const result = await this.pool!.query(sql, values);
    return result.rows;
  }
}

/**
 * Extended summary shape used at runtime — has optional quality fields not in the
 * base ExecutionSummary contract (which only guarantees traces/objects/variants).
 */
interface RuntimeSummary extends ExecutionSummary {
  traceCount?: number;
  fitness?: number;
  precision?: number;
}

/**
 * Extract metrics from a receipt/execution summary
 */
export function extractMetrics(
  result: Partial<Receipt> & { summary?: ExecutionSummary; algorithm?: { name: string } },
  runId: string
): PostgresqlMetrics {
  const summary = result.summary as RuntimeSummary | undefined;
  return {
    run_id: runId,
    algorithm: result.algorithm?.name || 'unknown',
    log_size: summary?.traceCount ?? summary?.traces_processed ?? 0,
    fitness: summary?.fitness,
    precision: summary?.precision,
    timestamp: new Date().toISOString(),
  };
}
