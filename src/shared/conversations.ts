/**
 * Conversation loading — reads .pb files and brain artifacts
 * to build the full conversation list.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { DB_KEYS, readDbValue } from "./database";
import { BRAIN_DIR, CONVERSATIONS_DIR } from "./paths";
import { decodeVarint } from "./protobuf";
import { parseTrajectoryEntries } from "./trajectories";
import type { Artifact, Conversation, WorkspaceEntry } from "./types";

/**
 * Load all conversations, enriched with brain data and
 * workspace associations from the Antigravity state DB.
 */
export async function loadConversations(workspaces: WorkspaceEntry[]): Promise<Conversation[]> {
  const convFiles = await listConversationFiles();
  if (convFiles.length === 0) return [];

  const sortedFiles = await sortByModificationTime(convFiles);
  const { entries } = readTrajectorySummaries();
  const conversations: Conversation[] = [];

  for (const { file, mtime, size } of sortedFiles) {
    const cid = file.slice(0, -3);
    const modTime = new Date(mtime).toISOString().slice(0, 16).replace("T", " ");
    const sizeMb = Math.round((size / 1024 / 1024) * 10) / 10;

    const { title: brainTitle, artifacts } = await readBrainData(cid);
    const meta = extractDbMetadata(cid, entries, workspaces);

    conversations.push({
      id: cid,
      title: brainTitle || meta.title || "(no title)",
      brainTitle: brainTitle || "",
      date: modTime,
      size: sizeMb,
      artifacts,
      workspace: meta.wsName,
      workspaceUri: meta.wsUri,
      turnCount: meta.turnCount,
      isActive: meta.isActive,
      createdAt: meta.createdAt,
      gitRepo: meta.gitRepo,
      gitBranch: meta.gitBranch,
    });
  }

  return conversations;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

async function listConversationFiles(): Promise<string[]> {
  try {
    const files = await readdir(CONVERSATIONS_DIR);
    return files.filter((f) => f.endsWith(".pb"));
  } catch {
    return [];
  }
}

async function sortByModificationTime(
  files: string[],
): Promise<{ file: string; mtime: number; size: number }[]> {
  const withStats = await Promise.all(
    files.map(async (f) => {
      const fpath = join(CONVERSATIONS_DIR, f);
      const s = await stat(fpath);
      return { file: f, mtime: s.mtimeMs, size: s.size };
    }),
  );
  withStats.sort((a, b) => b.mtime - a.mtime);
  return withStats;
}

function readTrajectorySummaries(): { entries: Map<string, string> } {
  const raw = readDbValue(DB_KEYS.trajectorySummaries);
  if (!raw) return { entries: new Map() };

  const decoded = new Uint8Array(Buffer.from(raw, "base64"));
  return parseTrajectoryEntries(decoded);
}

interface DbMetadata {
  title: string;
  wsName: string;
  wsUri: string;
  turnCount?: number;
  isActive?: boolean;
  createdAt?: string;
  gitRepo?: string;
  gitBranch?: string;
}

/**
 * Parse a protobuf Timestamp message (F1=seconds, F2=nanos) → ISO string.
 */
function parseTimestamp(data: Uint8Array): string | undefined {
  let pos = 0;
  let seconds = 0;
  while (pos < data.length) {
    const tag = decodeVarint(data, pos);
    pos = tag.pos;
    const fn = tag.value >> 3;
    const wt = tag.value & 7;
    if (wt === 0) {
      const v = decodeVarint(data, pos);
      pos = v.pos;
      if (fn === 1) seconds = v.value;
    } else if (wt === 2) {
      const len = decodeVarint(data, pos);
      pos = len.pos + len.value;
    } else {
      break;
    }
  }
  if (seconds > 0) {
    return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
  }
  return undefined;
}

/**
 * Parse WorkspaceInfo (F9) sub-fields: primary_uri(1), git_context(3), branch(4).
 */
function parseWorkspaceInfo(data: Uint8Array): {
  uri: string;
  gitRepo?: string;
  gitBranch?: string;
} {
  let pos = 0;
  let uri = "";
  let gitRepo: string | undefined;
  let gitBranch: string | undefined;
  const decoder = new TextDecoder();

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

      if (fn === 1) {
        uri = decoder.decode(content);
      } else if (fn === 3) {
        // GitContext: parse sub-fields F1=repo_name
        let gp = 0;
        while (gp < content.length) {
          const gt = decodeVarint(content, gp);
          gp = gt.pos;
          const gfn = gt.value >> 3;
          const gwt = gt.value & 7;
          if (gwt === 2) {
            const gl = decodeVarint(content, gp);
            gp = gl.pos;
            if (gfn === 1) {
              gitRepo = decoder.decode(content.slice(gp, gp + gl.value));
            }
            gp += gl.value;
          } else if (gwt === 0) {
            const gv = decodeVarint(content, gp);
            gp = gv.pos;
          } else {
            break;
          }
        }
      } else if (fn === 4) {
        gitBranch = decoder.decode(content);
      }
    } else if (wt === 0) {
      const v = decodeVarint(data, pos);
      pos = v.pos;
    } else {
      break;
    }
  }

  return { uri, gitRepo, gitBranch };
}

function extractDbMetadata(
  cid: string,
  entries: Map<string, string>,
  workspaces: WorkspaceEntry[],
): DbMetadata {
  const result: DbMetadata = { title: "", wsName: "", wsUri: "" };

  const infoB64 = entries.get(cid);
  if (!infoB64) return result;

  try {
    const inner = new Uint8Array(Buffer.from(infoB64, "base64"));
    const decoder = new TextDecoder();
    let pos = 0;

    while (pos < inner.length) {
      const tag = decodeVarint(inner, pos);
      pos = tag.pos;
      const fn = tag.value >> 3;
      const wt = tag.value & 7;

      if (wt === 0) {
        // Varint fields: F2=turnCount, F5=isActive
        const v = decodeVarint(inner, pos);
        pos = v.pos;
        if (fn === 2) result.turnCount = v.value;
        if (fn === 5) result.isActive = v.value === 1;
      } else if (wt === 2) {
        // Length-delimited fields
        const len = decodeVarint(inner, pos);
        pos = len.pos;
        const content = inner.slice(pos, pos + len.value);
        pos += len.value;

        if (fn === 1) {
          // Title
          result.title = decoder.decode(content);
        } else if (fn === 3) {
          // Timestamp created_at
          result.createdAt = parseTimestamp(content);
        } else if (fn === 9) {
          // WorkspaceInfo — parse sub-fields
          const ws = parseWorkspaceInfo(content);
          if (ws.uri) {
            result.wsUri = ws.uri;
            const match = workspaces.find((w) => w.uri === ws.uri);
            result.wsName = match ? match.name : ws.uri.split("/").pop() || ws.uri;
          }
          if (ws.gitRepo) result.gitRepo = ws.gitRepo;
          if (ws.gitBranch) result.gitBranch = ws.gitBranch;
        }
      } else if (wt === 1) {
        pos += 8; // 64-bit
      } else if (wt === 5) {
        pos += 4; // 32-bit
      } else {
        break;
      }
    }
  } catch {
    // skip corrupt entries
  }

  return result;
}

async function readBrainData(cid: string): Promise<{ title: string; artifacts: Artifact[] }> {
  const bp = join(BRAIN_DIR, cid);
  const artifacts: Artifact[] = [];
  let title = "";

  let files: string[];
  try {
    files = await readdir(bp);
  } catch {
    return { title, artifacts };
  }

  const fileStats = await Promise.all(
    files.map(async (item) => {
      try {
        const s = await stat(join(bp, item));
        return { item, mtime: s.mtimeMs };
      } catch {
        return { item, mtime: 0 };
      }
    }),
  );

  const sortedItems = fileStats.sort((a, b) => b.mtime - a.mtime);

  for (const { item, mtime } of sortedItems) {
    const isMd = item.endsWith(".md");
    const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(item);

    if ((!isMd && !isImage) || item.endsWith(".resolved") || item.endsWith(".metadata.json"))
      continue;

    const fp = join(bp, item);
    let text = "";
    let size = 0;

    try {
      const file = Bun.file(fp);
      size = file.size;
      if (isMd) {
        text = await file.text();
      }
    } catch {
      continue;
    }

    let artTitle = item;
    if (isMd) {
      for (const line of text.split("\n")) {
        if (line.trim().startsWith("#")) {
          // Keep only the first valid heading
          artTitle = line
            .trim()
            .replace(/^#+\s*/, "")
            .slice(0, 100);
          break;
        }
      }
    }

    if (isMd) {
      if (item === "task.md" || !title) {
        title = artTitle;
      }
    }

    let summary = "";
    const metaPath = `${fp}.metadata.json`;
    try {
      const meta = JSON.parse(await Bun.file(metaPath).text());
      summary = (meta.summary as string) || "";
    } catch {
      // no metadata
    }

    const previewLines = isMd
      ? text
          .split("\n")
          .filter((l) => l.trim() && !l.trim().startsWith("#") && l.trim().length > 5)
          .slice(0, 6)
          .map((l) => l.trim().slice(0, 150))
      : ["[Image Artifact]"];

    artifacts.push({
      name: item,
      title: artTitle.slice(0, 80),
      summary: summary.slice(0, 400),
      preview: previewLines.join("\n").slice(0, 600),
      size: size,
      date: mtime,
    });
  }

  return { title, artifacts };
}
