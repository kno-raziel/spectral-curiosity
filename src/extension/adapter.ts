/**
 * Node.js (better-sqlite3) adapter implementing DbAdapter.
 *
 * Initializes the shared database and backup modules
 * with better-sqlite3-specific implementations.
 */

import Database from "better-sqlite3";
import { parseSnapshotEntries, setSnapshotLoader } from "../shared/backups";
import type { DbAdapter } from "../shared/database";
import { DB_KEYS, setDbFactory } from "../shared/database";
import { DB_PATH } from "../shared/paths";

function createNodeAdapter(readonly: boolean): DbAdapter {
  const db = new Database(DB_PATH, { readonly });
  return {
    queryGet<T>(sql: string, ...params: string[]): T | null {
      return (db.prepare(sql).get(...params) as T) ?? null;
    },
    run(sql: string, ...params: string[]): void {
      db.prepare(sql).run(...params);
    },
    close(): void {
      db.close();
    },
  };
}

/** Load snapshot from an arbitrary DB file path (for backup diffs) */
function loadSnapshotNode(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .prepare("SELECT value FROM ItemTable WHERE key = ?")
      .get(DB_KEYS.trajectorySummaries) as { value: string } | undefined;

    if (!row?.value) return [];

    const decoded = new Uint8Array(Buffer.from(row.value, "base64"));
    return parseSnapshotEntries(decoded);
  } finally {
    db.close();
  }
}

/** Initialize all shared modules with Node.js-specific adapters */
export function initNodeAdapters(): void {
  setDbFactory({
    readonly: () => createNodeAdapter(true),
    writable: () => createNodeAdapter(false),
  });
  setSnapshotLoader(loadSnapshotNode);
}
