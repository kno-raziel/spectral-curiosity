/**
 * Abstract database adapter for SQLite access.
 *
 * Both bun:sqlite and node-sqlite3-wasm implement this interface.
 * Each platform injects its adapter at startup via setDbFactory().
 */

/** Minimal contract for SQLite operations */
export interface DbAdapter {
  /** Run a read query, return a single row or null */
  queryGet<T>(sql: string, ...params: string[]): T | null;
  /** Run a write statement */
  run(sql: string, ...params: string[]): void;
  /** Close the database connection */
  close(): void;
}

/** DB keys used by Antigravity */
export const DB_KEYS = {
  trajectorySummaries: "antigravityUnifiedStateSync.trajectorySummaries",
  sidebarWorkspaces: "antigravityUnifiedStateSync.sidebarWorkspaces",
} as const;

interface ItemRow {
  value: string;
}

/** Injected at startup by each platform */
let createReadonlyAdapter: (() => DbAdapter) | null = null;
let createWritableAdapter: (() => DbAdapter) | null = null;

/** Register the DB adapter factories. Must be called before any data access. */
export function setDbFactory(factories: {
  readonly: () => DbAdapter;
  writable: () => DbAdapter;
}): void {
  createReadonlyAdapter = factories.readonly;
  createWritableAdapter = factories.writable;
}

/**
 * Execute a callback with a managed Database connection.
 * The connection is always closed after the callback completes.
 */
export function withDb<T>(fn: (db: DbAdapter) => T, writable = false): T {
  const factory = writable ? createWritableAdapter : createReadonlyAdapter;
  if (!factory) throw new Error("DB adapter not initialized — call setDbFactory() first");
  const db = factory();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * Read a single value from the ItemTable by key.
 * Returns null if the key doesn't exist.
 */
export function readDbValue(key: string): string | null {
  return withDb((db) => {
    const row = db.queryGet<ItemRow>("SELECT value FROM ItemTable WHERE key = ?", key);
    return row?.value ?? null;
  });
}
