import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

const baseDb = drizzle(pool);

/**
 * A request's RLS transaction is carried through the asynchronous call graph.
 *
 * PostgreSQL session settings are unsafe with a shared pool: a request can set a
 * tenant GUC on one connection and the next query can run on another connection,
 * while the first setting can remain visible to a later request. The context
 * below makes the application database handle transaction-aware. Code continues
 * to use the one canonical `db` export, but calls made inside
 * `withDatabaseTransactionContext()` are routed to the pinned transaction.
 */
export type Database = typeof baseDb;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const transactionContext = new AsyncLocalStorage<DatabaseTransaction>();

function contextAwareDatabase(target: Database): Database {
  return new Proxy(target, {
    get(source, property, receiver) {
      const current = transactionContext.getStore();
      const delegate = current && property !== "$client" ? current : source;
      const value = Reflect.get(delegate, property, delegate === source ? receiver : delegate);

      if (typeof value !== "function") return value;

      // Ensure nested transactions replace the context for their callback too;
      // this preserves the same connection while making savepoint-scoped code
      // resolve through the innermost transaction handle.
      if (property === "transaction") {
        return (callback: (tx: DatabaseTransaction) => Promise<unknown>, ...args: unknown[]) =>
          (value as (...params: unknown[]) => Promise<unknown>).apply(delegate, [
            async (nested: DatabaseTransaction) => transactionContext.run(nested, () => callback(nested)),
            ...args,
          ]);
      }

      return value.bind(delegate);
    },
  }) as Database;
}

/** The one application database handle; never create specialist DB clients. */
export const db = contextAwareDatabase(baseDb);

/**
 * Execute work on one connection with transaction-local request context.
 * Commit releases the connection and automatically clears all `SET LOCAL`
 * values; rollback does the same. Callers must perform all database work for a
 * request inside this callback rather than setting session-level GUCs.
 */
export async function withDatabaseTransactionContext<T>(
  operation: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => operation(tx));
}

/**
 * Execute a small control-ledger operation outside the current request
 * transaction. This is intentionally narrow: idempotency claims must commit
 * before a domain transaction begins, otherwise a crash would roll the claim
 * back and make an uncertain operation executable twice. It still uses the same
 * canonical pool and database schema; it is not a second database client.
 */
export function hasDatabaseTransactionContext(): boolean {
  return Boolean(transactionContext.getStore());
}

export async function withIndependentDatabase<T>(
  operation: (database: Database) => Promise<T>,
): Promise<T> {
  return operation(baseDb);
}
