/**
 * Backup listing, snapshot loading, and diff utilities.
 *
 * Scans for `state.vscdb.backup_app_*` files created by saveAssignments,
 * loads trajectory summaries from any snapshot, and computes diffs between two.
 */

import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DB_PATH } from "./paths";
import { decodeVarint } from "./protobuf";
import type { BackupEntry, DiffEntry, DiffResult, SnapshotConversation } from "./types";

/**
 * Load a snapshot — requires a platform-specific DB opener.
 * Injected by each platform's adapter.
 */
let snapshotLoader: ((dbPath: string) => SnapshotConversation[]) | null = null;

/** Register the snapshot loader. Must be called at startup. */
export function setSnapshotLoader(loader: (dbPath: string) => SnapshotConversation[]): void {
  snapshotLoader = loader;
}

/**
 * List all backup files, sorted newest first.
 */
export async function listBackups(): Promise<BackupEntry[]> {
  const dir = dirname(DB_PATH);
  const files = await readdir(dir);
  const backups: BackupEntry[] = [];

  for (const f of files) {
    const match = f.match(/^state\.vscdb\.backup_app_(\d+)$/);
    if (!match) continue;

    const ts = Number.parseInt(match[1], 10);
    const fullPath = join(dir, f);
    const info = await stat(fullPath);

    backups.push({
      filename: f,
      path: fullPath,
      timestamp: ts,
      date: new Date(ts * 1000).toISOString(),
      sizeBytes: info.size,
    });
  }

  return backups.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Compute a diff between two database snapshots.
 * Use "current" as the path for the live database.
 */
export function diffSnapshots(pathA: string, pathB: string): DiffResult {
  if (!snapshotLoader)
    throw new Error("Snapshot loader not initialized — call setSnapshotLoader() first");

  const dbA = pathA === "current" ? DB_PATH : pathA;
  const dbB = pathB === "current" ? DB_PATH : pathB;

  const snapshotA = snapshotLoader(dbA);
  const snapshotB = snapshotLoader(dbB);

  const mapA = new Map(snapshotA.map((c) => [c.id, c]));
  const mapB = new Map(snapshotB.map((c) => [c.id, c]));

  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const changes: DiffEntry[] = [];

  for (const id of allIds) {
    const a = mapA.get(id);
    const b = mapB.get(id);

    const titleA = a?.title ?? "(not present)";
    const titleB = b?.title ?? "(not present)";
    const wsA = a?.workspaceUri ?? "";
    const wsB = b?.workspaceUri ?? "";

    const titleChanged = titleA !== titleB;
    const workspaceChanged = wsA !== wsB;

    if (titleChanged || workspaceChanged) {
      changes.push({
        id,
        titleA,
        titleB,
        workspaceA: wsA,
        workspaceB: wsB,
        titleChanged,
        workspaceChanged,
      });
    }
  }

  const labelA =
    pathA === "current" ? "Current" : `Backup ${pathA.match(/backup_app_(\d+)/)?.[1] ?? pathA}`;
  const labelB =
    pathB === "current" ? "Current" : `Backup ${pathB.match(/backup_app_(\d+)/)?.[1] ?? pathB}`;

  return {
    labelA,
    labelB,
    changes,
    totalA: snapshotA.length,
    totalB: snapshotB.length,
  };
}

// ─── Protobuf parsing (simplified for snapshots) ────────────────────────────

export function parseSnapshotEntries(decoded: Uint8Array): SnapshotConversation[] {
  const results: SnapshotConversation[] = [];
  let pos = 0;

  while (pos < decoded.length) {
    const tag = decodeVarint(decoded, pos);
    pos = tag.pos;
    if ((tag.value & 7) !== 2) break;

    const len = decodeVarint(decoded, pos);
    pos = len.pos;
    const entry = decoded.slice(pos, pos + len.value);
    pos += len.value;

    let ep = 0;
    let uid: string | null = null;
    let infoB64: string | null = null;

    while (ep < entry.length) {
      const t = decodeVarint(entry, ep);
      ep = t.pos;
      const fn = t.value >> 3;
      const wt = t.value & 7;

      if (wt === 2) {
        const l = decodeVarint(entry, ep);
        ep = l.pos;
        const content = entry.slice(ep, ep + l.value);
        ep += l.value;

        if (fn === 1) {
          uid = new TextDecoder().decode(content);
        } else if (fn === 2) {
          let sp = 0;
          const st = decodeVarint(content, sp);
          sp = st.pos;
          const sl = decodeVarint(content, sp);
          sp = sl.pos;
          infoB64 = new TextDecoder().decode(content.slice(sp, sp + sl.value));
        }
      } else if (wt === 0) {
        const v = decodeVarint(entry, ep);
        ep = v.pos;
      } else {
        break;
      }
    }

    if (uid && infoB64) {
      const inner = parseInnerFields(infoB64);
      results.push({
        id: uid,
        title: inner.title,
        workspaceUri: inner.workspaceUri,
      });
    }
  }

  return results;
}

function parseInnerFields(b64: string): { title: string; workspaceUri: string } {
  let inner: Uint8Array;
  try {
    inner = new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return { title: b64, workspaceUri: "" };
  }

  let title = "";
  let workspaceUri = "";
  let pos = 0;

  while (pos < inner.length) {
    const tag = decodeVarint(inner, pos);
    pos = tag.pos;
    const fn = tag.value >> 3;
    const wt = tag.value & 7;

    if (wt === 2) {
      const len = decodeVarint(inner, pos);
      pos = len.pos;
      const content = inner.slice(pos, pos + len.value);
      pos += len.value;

      if (fn === 1) {
        title = new TextDecoder().decode(content);
      } else if (fn === 9) {
        workspaceUri = extractField1String(content);
      }
    } else if (wt === 0) {
      const v = decodeVarint(inner, pos);
      pos = v.pos;
    } else {
      break;
    }
  }

  return { title, workspaceUri };
}

function extractField1String(data: Uint8Array): string {
  let pos = 0;
  while (pos < data.length) {
    const tag = decodeVarint(data, pos);
    pos = tag.pos;
    const fn = tag.value >> 3;
    const wt = tag.value & 7;
    if (wt === 2) {
      const len = decodeVarint(data, pos);
      pos = len.pos;
      const content = data.slice(pos, pos + len.value);
      pos += len.value;
      if (fn === 1) return new TextDecoder().decode(content);
    } else if (wt === 0) {
      const v = decodeVarint(data, pos);
      pos = v.pos;
    } else {
      break;
    }
  }
  return "";
}
