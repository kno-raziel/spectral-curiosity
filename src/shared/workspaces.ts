/**
 * Workspace management — load, save, and auto-detect workspaces.
 *
 * Uses node:fs/promises for file I/O (works on both Bun and Node).
 */

import { readFile, writeFile } from "node:fs/promises";
import { DB_KEYS, readDbValue } from "./database";
import { WORKSPACE_CONFIG_PATH } from "./paths";
import { decodeVarint } from "./protobuf";
import type { WorkspaceEntry } from "./types";

/**
 * Load workspaces from the config file, falling back to
 * auto-detection from the Antigravity sidebar DB.
 */
export async function loadWorkspaces(): Promise<WorkspaceEntry[]> {
  try {
    const data = await readFile(WORKSPACE_CONFIG_PATH, "utf-8");
    return JSON.parse(data) as WorkspaceEntry[];
  } catch {
    return detectWorkspacesFromDb();
  }
}

/** Persist workspace entries to the config file. */
export async function saveWorkspaces(workspaces: WorkspaceEntry[]): Promise<void> {
  await writeFile(WORKSPACE_CONFIG_PATH, JSON.stringify(workspaces, null, 2), "utf-8");
}

/**
 * Auto-detect workspaces by parsing the protobuf-encoded
 * sidebar workspace list from the Antigravity state DB.
 */
function detectWorkspacesFromDb(): WorkspaceEntry[] {
  const raw = readDbValue(DB_KEYS.sidebarWorkspaces);
  if (!raw) return [];

  const workspaces: WorkspaceEntry[] = [];
  const data = new Uint8Array(Buffer.from(raw, "base64"));
  let pos = 0;

  while (pos < data.length) {
    const tag = decodeVarint(data, pos);
    pos = tag.pos;
    if ((tag.value & 7) !== 2) break;

    const len = decodeVarint(data, pos);
    pos = len.pos;
    const entry = data.slice(pos, pos + len.value);
    pos += len.value;

    const uri = parseEntryUri(entry);
    if (uri) {
      workspaces.push({
        name: uri.split("/").pop() || uri,
        uri,
        gitSlug: "",
        gitRemote: "",
        branch: "",
      });
    }
  }

  return workspaces;
}

/** Extract the URI (field 1) from a single workspace protobuf entry. */
function parseEntryUri(entry: Uint8Array): string | null {
  let ep = 0;
  while (ep < entry.length) {
    const t = decodeVarint(entry, ep);
    ep = t.pos;
    const fn = t.value >> 3;
    const wt = t.value & 7;

    if (wt === 2) {
      const l = decodeVarint(entry, ep);
      ep = l.pos;
      if (fn === 1) {
        return new TextDecoder().decode(entry.slice(ep, ep + l.value));
      }
      ep += l.value;
    } else if (wt === 0) {
      const v = decodeVarint(entry, ep);
      ep = v.pos;
    } else {
      break;
    }
  }
  return null;
}
