/**
 * Node.js (node-sqlite3-wasm) adapter implementing DbAdapter.
 *
 * Uses the centralized sqlite-loader for resilient lazy loading.
 * The extension always activates — SQLite errors surface only when
 * database access is actually needed.
 */

import { parseSnapshotEntries, setSnapshotLoader } from "../shared/backups";
import type { DbAdapter } from "../shared/database";
import { DB_KEYS, setDbFactory } from "../shared/database";
import { DB_PATH } from "../shared/paths";
import { createDatabase } from "./sdk/sqlite-loader";

function createNodeAdapter(readOnly: boolean): DbAdapter {
  const db = createDatabase(DB_PATH, { readOnly });
  return {
    queryGet<T>(sql: string, ...params: string[]): T | null {
      return (db.get(sql, params) as T) ?? null;
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
function loadSnapshotNode(dbPath: string) {
  const db = createDatabase(dbPath, { readOnly: true });
  try {
    const row = db.get("SELECT value FROM ItemTable WHERE key = ?", [
      DB_KEYS.trajectorySummaries,
    ]) as { value: string } | null;

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
