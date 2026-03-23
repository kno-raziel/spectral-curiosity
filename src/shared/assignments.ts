/**
 * Save workspace assignments back to the Antigravity state DB.
 *
 * Modifies protobuf-encoded trajectory summaries to update
 * workspace associations for conversations.
 */

import { copyFile } from "node:fs/promises";
import type { DbAdapter } from "./database";
import { DB_KEYS, withDb } from "./database";
import { DB_PATH } from "./paths";
import {
  buildField9,
  concatBytes,
  encodeLengthDelimited,
  encodeStringField,
  encodeVarint,
  stripField,
} from "./protobuf";
import { parseTrajectoryEntries } from "./trajectories";
import type { SavePayload, SaveResult, WorkspaceEntry } from "./types";

/**
 * Save workspace assignments to the DB.
 * Creates a backup before writing any changes.
 */
export async function saveAssignments(
  payload: SavePayload,
  workspaces: WorkspaceEntry[],
): Promise<SaveResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const backup = `${DB_PATH}.backup_app_${timestamp}`;
  await copyFile(DB_PATH, backup);

  return withDb(
    (db) => {
      const row = db.queryGet<{ value: string }>(
        "SELECT value FROM ItemTable WHERE key = ?",
        DB_KEYS.trajectorySummaries,
      );

      if (!row?.value) {
        return { updated: 0, renamed: 0, backup, error: "No data in DB" };
      }

      const decoded = new Uint8Array(Buffer.from(row.value, "base64"));
      const {
        entries: entriesData,
        rawEntries: rawEntriesData,
        order: entriesOrder,
      } = parseTrajectoryEntries(decoded);

      const { resultChunks, updated, renamed } = rebuildEntries(
        entriesOrder,
        entriesData,
        rawEntriesData,
        payload.assignments,
        payload.renames,
        workspaces,
      );

      const result = concatBytes(...resultChunks);

      const sidebar = ensureSidebarWorkspaces(db, payload.assignments, workspaces);

      const sidebarEncoded = Buffer.from(sidebar).toString("base64");
      db.run(
        "UPDATE ItemTable SET value = ? WHERE key = ?",
        sidebarEncoded,
        DB_KEYS.sidebarWorkspaces,
      );

      const resultEncoded = Buffer.from(result).toString("base64");
      db.run(
        "UPDATE ItemTable SET value = ? WHERE key = ?",
        resultEncoded,
        DB_KEYS.trajectorySummaries,
      );

      return { updated, renamed, backup };
    },
    true, // writable
  );
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function rebuildEntries(
  order: string[],
  data: Map<string, string>,
  rawEntries: Map<string, Uint8Array>,
  assignments: Record<string, string>,
  renames: Record<string, string>,
  workspaces: WorkspaceEntry[],
): { resultChunks: Uint8Array[]; updated: number; renamed: number } {
  let updated = 0;
  let renamed = 0;
  const wsMap = new Map(workspaces.map((w) => [w.name, w]));
  const resultChunks: Uint8Array[] = [];
  const processedCids = new Set<string>();

  for (const cid of order) {
    processedCids.add(cid);
    const infoB64 = data.get(cid);
    const origEntryBytes = rawEntries.get(cid);
    if (!infoB64 || !origEntryBytes) continue;

    let inner: Uint8Array;
    try {
      inner = new Uint8Array(Buffer.from(infoB64, "base64"));
    } catch {
      resultChunks.push(encodeLengthDelimited(1, origEntryBytes));
      continue;
    }

    if (cid in assignments || Object.hasOwn(assignments, cid)) {
      const wsName = assignments[cid];
      inner = stripField(inner, 9);

      const ws = wsMap.get(wsName);
      if (wsName && ws) {
        inner = concatBytes(inner, buildField9(ws));
        updated += 1;
      } else if (wsName === "") {
        updated += 1;
      }
    }

    if (cid in renames || Object.hasOwn(renames, cid)) {
      const newTitle = renames[cid];
      if (newTitle) {
        inner = stripField(inner, 1);
        inner = concatBytes(encodeStringField(1, newTitle), inner);
        renamed += 1;
      }
    }

    const newB64 = Buffer.from(inner).toString("base64");
    const sub = encodeStringField(1, newB64);

    // Preserve ALL other root metadata (timestamps, history, pins)
    const preservedRootFields = stripField(origEntryBytes, 2);
    const entry = concatBytes(preservedRootFields, encodeLengthDelimited(2, sub));
    resultChunks.push(encodeLengthDelimited(1, entry));
  }

  // Create fresh entries for orphaned conversations (exist on disk but not in DB index)
  const allTargetCids = new Set([...Object.keys(assignments), ...Object.keys(renames)]);
  for (const cid of allTargetCids) {
    if (processedCids.has(cid)) continue;

    // Build a minimal inner info blob from scratch
    const title = renames[cid] || `Conversation ${cid.slice(0, 8)}`;
    let inner: Uint8Array = encodeStringField(1, title);

    const wsName = assignments[cid];
    if (wsName) {
      const ws = wsMap.get(wsName);
      if (ws) {
        inner = concatBytes(inner, buildField9(ws));
        updated += 1;
      }
    }

    if (cid in renames) renamed += 1;

    const infoB64 = Buffer.from(inner).toString("base64");
    const sub = encodeStringField(1, infoB64);
    const entry = concatBytes(encodeStringField(1, cid), encodeLengthDelimited(2, sub));
    resultChunks.push(encodeLengthDelimited(1, entry));
  }

  return { resultChunks, updated, renamed };
}

function ensureSidebarWorkspaces(
  db: DbAdapter,
  assignments: Record<string, string>,
  workspaces: WorkspaceEntry[],
): Uint8Array {
  const swRow = db.queryGet<{ value: string }>(
    "SELECT value FROM ItemTable WHERE key = ?",
    DB_KEYS.sidebarWorkspaces,
  );

  let sidebar: Uint8Array = swRow?.value
    ? new Uint8Array(Buffer.from(swRow.value, "base64"))
    : new Uint8Array(0);

  const wsMap = new Map(workspaces.map((w) => [w.name, w]));
  const assignedWsNames = new Set(Object.values(assignments));

  for (const wsName of assignedWsNames) {
    const ws = wsMap.get(wsName);
    if (!ws) continue;

    const sidebarStr = new TextDecoder().decode(sidebar);
    if (sidebarStr.includes(ws.uri)) continue;

    const wsInner = concatBytes(
      encodeStringField(4, ws.uri),
      encodeLengthDelimited(5, concatBytes(encodeVarint((2 << 3) | 0), encodeVarint(1))),
    );
    const wsB64 = Buffer.from(wsInner).toString("base64");
    const wsEntry = concatBytes(
      encodeStringField(1, ws.uri),
      encodeLengthDelimited(2, encodeStringField(1, wsB64)),
    );
    sidebar = concatBytes(sidebar, encodeLengthDelimited(1, wsEntry));
  }

  return sidebar;
}
