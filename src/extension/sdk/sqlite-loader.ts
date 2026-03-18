/**
 * Centralized lazy loader for node-sqlite3-wasm.
 *
 * Provides a single, resilient entry point for SQLite access across the
 * extension. Uses `require()` inside try/catch so the extension always
 * activates — even if the WASM module is unavailable at runtime.
 *
 * Both `adapter.ts` and `backup-engine.ts` import from here instead of
 * directly depending on `node-sqlite3-wasm`.
 */

/** Minimal typed interface for the subset of node-sqlite3-wasm we use */
export interface SqliteDatabase {
  get(sql: string, params?: unknown[]): Record<string, unknown> | null;
  run(sql: string, params?: unknown[]): void;
  close(): void;
}

interface SqliteModule {
  Database: new (path: string, opts?: { readOnly?: boolean }) => SqliteDatabase;
}

/** Cached module reference (null = not yet attempted, undefined = failed) */
let cachedModule: SqliteModule | null | undefined;

/**
 * Lazy-load node-sqlite3-wasm. Returns the module or null if unavailable.
 * The result is cached after the first call.
 */
export function loadSqliteModule(): SqliteModule | null {
  if (cachedModule !== undefined) {
    return cachedModule ?? null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require("node-sqlite3-wasm") as SqliteModule;
    return cachedModule;
  } catch {
    cachedModule = null;
    return null;
  }
}

/**
 * Create a new SQLite Database instance.
 * Throws a descriptive error if node-sqlite3-wasm is unavailable.
 */
export function createDatabase(path: string, opts?: { readOnly?: boolean }): SqliteDatabase {
  const mod = loadSqliteModule();
  if (!mod) {
    throw new Error(
      "SQLite unavailable: node-sqlite3-wasm could not be loaded. " +
        "Ensure the module is included in the VSIX package.",
    );
  }
  return new mod.Database(path, opts);
}
