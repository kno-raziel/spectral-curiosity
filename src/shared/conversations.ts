/**
 * Conversation loading — reads .pb files and brain artifacts
 * to build the full conversation list.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { DB_KEYS, readDbValue } from "./database";
import { BRAIN_DIR, CONVERSATIONS_DIR } from "./paths";
import { decodeVarint, extractField9Uri } from "./protobuf";
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
    const { title: dbTitle, wsName, wsUri } = extractDbMetadata(cid, entries, workspaces);

    conversations.push({
      id: cid,
      title: dbTitle || brainTitle || "(no title)",
      brainTitle: brainTitle || "",
      date: modTime,
      size: sizeMb,
      artifacts,
      workspace: wsName,
      workspaceUri: wsUri,
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

function extractDbMetadata(
  cid: string,
  entries: Map<string, string>,
  workspaces: WorkspaceEntry[],
): { title: string; wsName: string; wsUri: string } {
  let title = "";
  let wsName = "";
  let wsUri = "";

  const infoB64 = entries.get(cid);
  if (!infoB64) return { title, wsName, wsUri };

  try {
    const inner = new Uint8Array(Buffer.from(infoB64, "base64"));

    const t = decodeVarint(inner, 0);
    if (t.value >> 3 === 1 && (t.value & 7) === 2) {
      const tl = decodeVarint(inner, t.pos);
      title = new TextDecoder().decode(inner.slice(tl.pos, tl.pos + tl.value));
    }

    const uri = extractField9Uri(inner);
    if (uri) {
      wsUri = uri;
      const match = workspaces.find((w) => w.uri === uri);
      wsName = match ? match.name : uri.split("/").pop() || uri;
    }
  } catch {
    // skip corrupt entries
  }

  return { title, wsName, wsUri };
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

  for (const item of files.sort()) {
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

    if (!title && isMd) title = artTitle; // Fallback title for the conversation itself

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
    });
  }

  return { title, artifacts };
}
