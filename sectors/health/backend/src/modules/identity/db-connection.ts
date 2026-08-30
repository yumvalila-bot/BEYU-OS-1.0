import { Injectable } from "@nestjs/common";
import { Pool, PoolConfig } from "pg";
import { PGlite } from "@electric-sql/pglite";

/** DI token for the identity database connection. */
export const DB_CONNECTION = "DB_CONNECTION";

/**
 * Thin, driver-agnostic database connection used by the identity repositories.
 *
 * Two concrete adapters are provided:
 *  - PgConnection: real PostgreSQL via node-postgres (production).
 *  - PGliteConnection: a genuine in-process PostgreSQL engine (WASM build of
 *    PostgreSQL 16) used for real-SQL integration tests where a standalone
 *    Postgres server is unavailable.
 *
 * Both execute the SAME parameterized SQL, so the identity logic is verified
 * against a real PostgreSQL engine, not a mocked database.
 */
export interface DbQueryRow {
  [column: string]: unknown;
}

export interface DbConnection {
  /** Run parameterized SQL and return result rows. */
  query<T extends DbQueryRow = DbQueryRow>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Run one or more statements (DDL/multi-statement) with no result rows. */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (conn: DbConnection) => Promise<T>): Promise<T>;
}

/** node-postgres backed connection (production). */
export class PgConnection implements DbConnection {
  private readonly pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async query<T extends DbQueryRow = DbQueryRow>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    const result = await this.pool.query(sql, params as never[]);
    return result.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (conn: DbConnection) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tx: DbConnection = {
        query: async <R extends DbQueryRow = DbQueryRow>(
          sql: string,
          p?: unknown[],
        ) => {
          const r = await client.query(sql, p as never[]);
          return r.rows as R[];
        },
        exec: async (sql: string) => {
          await client.query(sql);
        },
        transaction: async <R>(
          inner: (c: DbConnection) => Promise<R>,
        ): Promise<R> => inner(tx),
      };
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** PGlite (real PostgreSQL 16 in-process) — used for integration tests. */
export class PGliteConnection implements DbConnection {
  constructor(private readonly db: PGlite) {}

  async query<T extends DbQueryRow = DbQueryRow>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    const result = await this.db.query(sql, params);
    return (result.rows ?? []) as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async transaction<T>(fn: (conn: DbConnection) => Promise<T>): Promise<T> {
    // pglite exposes a real transaction API: queries must be routed through the
    // transaction's `tx` handle (NOT the outer connection) or PGlite deadlocks.
    return this.db.transaction(async (tx) => {
      const txConn: DbConnection = {
        query: async <R extends DbQueryRow = DbQueryRow>(
          sql: string,
          p?: unknown[],
        ) => {
          const r = await tx.query(sql, p);
          return (r.rows ?? []) as R[];
        },
        exec: async (sql: string) => {
          await tx.exec(sql);
        },
        transaction: async <R>(
          inner: (c: DbConnection) => Promise<R>,
        ): Promise<R> => inner(txConn),
      };
      return fn(txConn);
    });
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/** In-memory PGlite instance factory for tests. */
@Injectable()
export class PGliteConnectionFactory {
  async create(): Promise<PGliteConnection> {
    const db = new PGlite();
    return new PGliteConnection(db);
  }
}
