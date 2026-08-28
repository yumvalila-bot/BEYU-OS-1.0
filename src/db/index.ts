import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

function createPool(): Pool {
  const existing = globalForDb.__arenaNextJsPostgresqlPool;
  if (existing) return existing;
  const created = new Pool({
    connectionString: databaseUrl(),
    // Bounded acquisition: when the database is unreachable, requests must
    // fail fast (health reports DOWN, APIs return 5xx) instead of hanging
    // forever on an unbounded connection wait. Generous enough that normal
    // operation — including load-test burst connection establishment — is
    // never affected.
    connectionTimeoutMillis: 10_000,
  });
  globalForDb.__arenaNextJsPostgresqlPool = created;
  return created;
}

/**
 * The pool connects lazily on first use.
 *
 * Deployment platforms (Vercel included) build the application in an
 * environment where runtime secrets such as DATABASE_URL are not present.
 * Because Next.js imports route modules while collecting page data, a
 * module-load requirement on DATABASE_URL makes every production build fail
 * before the application can ever start. The connection is therefore created
 * on first real use: the same canonical "DATABASE_URL is required" error is
 * thrown at the first query instead of at import, and the health endpoint
 * reports `database: DOWN` (503) until the environment is configured.
 */
function lazyPool(): Pool {
  let instance: Pool | undefined;
  const get = () => (instance ??= createPool());
  return new Proxy({} as Pool, {
    get(_target, property) {
      const value = Reflect.get(get(), property, get());
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(get()) : value;
    },
    set(_target, property, value) {
      Reflect.set(get(), property, value);
      return true;
    },
    has(_target, property) {
      return property in get();
    },
    getPrototypeOf() {
      // Preserve prototype identity: drizzle-orm classifies its client with
      // `client instanceof Pool || getPrototypeOf(client).constructor.name
      // .includes("Pool")` to decide whether transaction() must acquire a
      // dedicated connection. A prototype-opaque proxy would make every
      // "transaction" run as disconnected autocommit statements.
      return Reflect.getPrototypeOf(get());
    },
    ownKeys() {
      return Reflect.ownKeys(get());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(get(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

/** The one application connection pool; connects on first use. */
export const pool: Pool = lazyPool();

function lazyObject<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  const get = () => (instance ??= factory());
  return new Proxy({} as T, {
    get(_target, property) {
      const value = Reflect.get(get(), property, get());
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(get()) : value;
    },
    set(_target, property, value) {
      Reflect.set(get(), property, value);
      return true;
    },
    has(_target, property) {
      return property in get();
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(get());
    },
    ownKeys() {
      return Reflect.ownKeys(get());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(get(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

const baseDb = lazyObject(() => drizzle(pool));

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
