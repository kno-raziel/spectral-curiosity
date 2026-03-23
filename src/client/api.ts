/**
 * Environment-aware API layer.
 *
 * Detects whether running inside a VS Code webview (extension)
 * or a regular browser (Bun server) and uses the appropriate
 * transport: postMessage vs HTTP fetch.
 */

import type { Conversation, SavePayload, SaveResult, WorkspaceEntry } from "../shared/types";

// ─── VS Code webview transport ──────────────────────────────────────────────

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const isVsCodeWebview = typeof acquireVsCodeApi === "function";

let vscode: VsCodeApi | null = null;

if (isVsCodeWebview) {
  vscode = acquireVsCodeApi();

  // Listen for responses from extension host
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data as { type: string; id: string; data?: unknown; error?: string };
    if (msg.type !== "response") return;

    const req = pending.get(msg.id);
    if (!req) return;
    pending.delete(msg.id);

    if (msg.error) {
      req.reject(new Error(msg.error));
    } else {
      req.resolve(msg.data);
    }
  });
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

const pending = new Map<string, PendingRequest>();
let nextId = 0;

function postMessageRequest<T>(method: string, params?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = String(nextId++);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    vscode?.postMessage({ type: "request", id, method, params });
  });
}

// ─── HTTP fetch transport ───────────────────────────────────────────────────

const API_BASE = "";

// ─── Public API (same signatures regardless of transport) ───────────────────

export async function fetchConversations(): Promise<Conversation[]> {
  if (isVsCodeWebview) return postMessageRequest("getConversations");
  const res = await fetch(`${API_BASE}/api/conversations`);
  if (!res.ok) throw new Error("Failed to load conversations");
  return res.json();
}

export async function fetchWorkspaces(): Promise<WorkspaceEntry[]> {
  if (isVsCodeWebview) return postMessageRequest("getWorkspaces");
  const res = await fetch(`${API_BASE}/api/workspaces`);
  if (!res.ok) throw new Error("Failed to load workspaces");
  return res.json();
}

export async function saveChanges(payload: SavePayload): Promise<SaveResult> {
  if (isVsCodeWebview) return postMessageRequest("save", payload);
  const res = await fetch(`${API_BASE}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export interface BackupEntry {
  filename: string;
  path: string;
  timestamp: number;
  date: string;
  sizeBytes: number;
}

export interface DiffResult {
  labelA: string;
  labelB: string;
  changes: Array<{
    id: string;
    titleA: string;
    titleB: string;
    workspaceA: string;
    workspaceB: string;
    titleChanged: boolean;
    workspaceChanged: boolean;
  }>;
  totalA: number;
  totalB: number;
}

export async function fetchSnapshots(): Promise<BackupEntry[]> {
  if (isVsCodeWebview) return postMessageRequest("getBackups");
  const res = await fetch(`${API_BASE}/api/snapshots`);
  if (!res.ok) throw new Error("Failed to load snapshots");
  return res.json();
}

export async function fetchSnapshotDiff(pathA: string, pathB: string): Promise<DiffResult> {
  if (isVsCodeWebview) return postMessageRequest("diffBackups", { a: pathA, b: pathB });
  const params = new URLSearchParams({ a: pathA, b: pathB });
  const res = await fetch(`${API_BASE}/api/snapshots/diff?${params}`);
  if (!res.ok) throw new Error("Failed to load diff");
  return res.json();
}

// ─── Artifact Content API ───────────────────────────────────────────────────

export function getArtifactUrl(cid: string, name: string): string {
  const params = new URLSearchParams({ 
    cid, 
    name, 
    t: Date.now().toString() // Cache buster to circumvent old 404/HTML cached responses
  });
  return `${API_BASE}/api/artifact?${params}`;
}

export async function fetchArtifactContent(cid: string, name: string): Promise<string> {
  if (isVsCodeWebview) return postMessageRequest("getArtifactContent", { cid, name });
  const params = new URLSearchParams({ cid, name });
  const res = await fetch(`${API_BASE}/api/artifact?${params}`);
  if (!res.ok) throw new Error("Failed to load artifact");
  return res.text();
}

// ─── Backup Viewer API ──────────────────────────────────────────────────────

import type { ConversationBackupMeta } from "../shared/backup-format";
import type { BackupSummary, SearchResult } from "../shared/backup-reader-types";
import type { FullTrajectory } from "../shared/trajectory-types";

export async function fetchBackupList(): Promise<BackupSummary[]> {
  if (isVsCodeWebview) return postMessageRequest("listBackups");
  const res = await fetch(`${API_BASE}/api/backups`);
  if (!res.ok) throw new Error("Failed to load backups");
  return res.json();
}

export async function fetchBackupConversations(
  backupId: string,
): Promise<ConversationBackupMeta[]> {
  if (isVsCodeWebview) return postMessageRequest("listBackupConversations", { backupId });
  const res = await fetch(`${API_BASE}/api/backups/${encodeURIComponent(backupId)}/conversations`);
  if (!res.ok) throw new Error("Failed to load conversations");
  return res.json();
}

export async function fetchBackupTrajectory(
  backupId: string,
  convId: string,
): Promise<FullTrajectory> {
  if (isVsCodeWebview) return postMessageRequest("getBackupTrajectory", { backupId, convId });
  const res = await fetch(
    `${API_BASE}/api/backups/${encodeURIComponent(backupId)}/conversations/${encodeURIComponent(convId)}`,
  );
  if (!res.ok) throw new Error("Failed to load trajectory");
  return res.json();
}

export async function fetchBackupSearch(backupId: string, query: string): Promise<SearchResult[]> {
  if (isVsCodeWebview) return postMessageRequest("searchBackup", { backupId, query });
  const params = new URLSearchParams({ q: query });
  const res = await fetch(
    `${API_BASE}/api/backups/${encodeURIComponent(backupId)}/search?${params}`,
  );
  if (!res.ok) throw new Error("Failed to search");
  return res.json();
}

// ─── Brain Explorer API ─────────────────────────────────────────────────────

import type { FileTreeNode, KnowledgeTopic } from "../shared/backup-reader";

export async function fetchBrainTree(backupId: string, convId: string): Promise<FileTreeNode[]> {
  const res = await fetch(
    `${API_BASE}/api/backups/${encodeURIComponent(backupId)}/brain/${encodeURIComponent(convId)}/tree`,
  );
  if (!res.ok) throw new Error("Failed to load brain tree");
  return res.json();
}

/** Build URL for serving a brain file (images, etc.) */
export function brainFileUrl(backupId: string, convId: string, filePath: string): string {
  const params = new URLSearchParams({ path: filePath });
  return `${API_BASE}/api/backups/${encodeURIComponent(backupId)}/brain/${encodeURIComponent(convId)}/file?${params}`;
}

export async function fetchBrainFileContent(
  backupId: string,
  convId: string,
  filePath: string,
): Promise<string> {
  const res = await fetch(brainFileUrl(backupId, convId, filePath));
  if (!res.ok) throw new Error("Failed to load file");
  return res.text();
}

// ─── Knowledge Base API ─────────────────────────────────────────────────────

export async function fetchKnowledgeTopics(backupId: string): Promise<KnowledgeTopic[]> {
  const res = await fetch(`${API_BASE}/api/backups/${encodeURIComponent(backupId)}/knowledge`);
  if (!res.ok) throw new Error("Failed to load knowledge topics");
  return res.json();
}

export async function fetchKnowledgeArtifact(
  backupId: string,
  topicId: string,
  filePath: string,
): Promise<string> {
  // Encode each path segment separately to support nested paths
  const encodedPath = filePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const res = await fetch(
    `${API_BASE}/api/backups/${encodeURIComponent(backupId)}/knowledge/${encodeURIComponent(topicId)}/artifacts/${encodedPath}`,
  );
  if (!res.ok) throw new Error("Failed to load artifact");
  return res.text();
}

// ─── Backup Directory Config ────────────────────────────────────────────────

export async function fetchBackupConfig(): Promise<{ directory: string }> {
  const res = await fetch(`${API_BASE}/api/backups/config`);
  if (!res.ok) throw new Error("Failed to fetch backup config");
  return res.json();
}

export async function setBackupDir(directory: string): Promise<{ directory: string }> {
  const res = await fetch(`${API_BASE}/api/backups/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? "Failed to set backup directory");
  }
  return res.json();
}
