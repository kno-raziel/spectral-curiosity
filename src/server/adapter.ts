/**
 * Bun SQLite adapter implementing DbAdapter.
 *
 * Initializes the shared database and backup modules
 * with bun:sqlite-specific implementations.
 */

import { Database } from "bun:sqlite";
import { parseSnapshotEntries, setSnapshotLoader } from "../shared/backups";
import type { DbAdapter } from "../shared/database";
import { DB_KEYS, setDbFactory } from "../shared/database";
import { DB_PATH } from "../shared/paths";

function createBunAdapter(readonly: boolean): DbAdapter {
  const db = new Database(DB_PATH, readonly ? { readonly: true } : { readwrite: true });
  return {
    queryGet<T>(sql: string, ...params: string[]): T | null {
      return (db.query(sql).get(...params) as T) ?? null;
    },
    run(sql: string, ...params: string[]): void {
      db.run(sql, params);
    },
    close(): void {
      db.close();
    },
  };
}

/** Load snapshot from an arbitrary DB file path (for backup diffs) */
function loadSnapshotBun(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .query("SELECT value FROM ItemTable WHERE key = ?")
      .get(DB_KEYS.trajectorySummaries) as { value: string } | null;

    if (!row?.value) return [];

    const decoded = new Uint8Array(Buffer.from(row.value, "base64"));
    return parseSnapshotEntries(decoded);
  } finally {
    db.close();
  }
}

/** Initialize all shared modules with Bun-specific adapters */
export function initBunAdapters(): void {
  setDbFactory({
    readonly: () => createBunAdapter(true),
    writable: () => createBunAdapter(false),
  });
  setSnapshotLoader(loadSnapshotBun);
}
