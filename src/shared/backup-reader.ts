/**
 * Platform-agnostic reader for Phase 1 backup directories.
 *
 * Reads the on-disk backup format (manifest.json, metadata.json,
 * trajectory.json, messages.md) and exposes methods for listing,
 * browsing, and searching backed-up conversations.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BackupManifest, ConversationBackupMeta } from "./backup-format";
import type { BackupSummary, SearchMatch, SearchResult } from "./backup-reader-types";
import type { FullTrajectory } from "./trajectory-types";

export class BackupReader {
  constructor(private readonly rootDir: string) {}

  /**
   * List all backup directories, sorted newest first.
   * Identifies backups by the presence of a manifest.json file.
   */
  async listBackups(): Promise<BackupSummary[]> {
    let entries: string[];
    try {
      entries = await readdir(this.rootDir);
    } catch {
      return [];
    }

    const summaries: BackupSummary[] = [];

    for (const name of entries) {
      const dirPath = join(this.rootDir, name);
      const dirStat = await stat(dirPath).catch(() => null);
      if (!dirStat?.isDirectory()) continue;

      const manifestPath = join(dirPath, "manifest.json");
      try {
        const raw = await readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(raw) as BackupManifest;
        summaries.push({
          id: name,
          path: dirPath,
          createdAt: manifest.createdAt,
          conversationCount: manifest.conversationCount,
          totalSizeBytes: manifest.totalSizeBytes,
          strategy: manifest.strategy,
        });
      } catch {
        // Not a valid backup directory — skip
      }
    }

    return summaries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /** Read the manifest.json for a specific backup */
  async getManifest(backupId: string): Promise<BackupManifest> {
    const raw = await readFile(this.manifestPath(backupId), "utf-8");
    return JSON.parse(raw) as BackupManifest;
  }

  /** List all conversations in a backup, sorted by last modified */
  async listConversations(backupId: string): Promise<ConversationBackupMeta[]> {
    const convsDir = join(this.backupPath(backupId), "conversations");
    let entries: string[];
    try {
      entries = await readdir(convsDir);
    } catch {
      return [];
    }

    const metas: ConversationBackupMeta[] = [];

    for (const convId of entries) {
      const metaPath = join(convsDir, convId, "metadata.json");
      try {
        const raw = await readFile(metaPath, "utf-8");
        metas.push(JSON.parse(raw) as ConversationBackupMeta);
      } catch {
        // Skip invalid conversation directories
      }
    }

    return metas.sort(
      (a, b) => new Date(b.lastModifiedTime).getTime() - new Date(a.lastModifiedTime).getTime(),
    );
  }

  /** Get the full trajectory (steps array) for a conversation */
  async getTrajectory(backupId: string, convId: string): Promise<FullTrajectory> {
    const filePath = join(this.conversationPath(backupId, convId), "trajectory.json");
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as FullTrajectory;
  }

  /** Get artifact snapshots for a conversation */
  async getArtifacts(backupId: string, convId: string): Promise<unknown[]> {
    const filePath = join(this.conversationPath(backupId, convId), "artifacts.json");
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as { artifactSnapshots?: unknown[] };
      return parsed.artifactSnapshots ?? [];
    } catch {
      return [];
    }
  }

  /** Read the human-readable markdown export */
  async getMarkdown(backupId: string, convId: string): Promise<string> {
    const filePath = join(this.conversationPath(backupId, convId), "messages.md");
    return readFile(filePath, "utf-8");
  }

  /**
   * Full-text search across all conversations' messages.md files.
   * Returns matching lines with context snippets.
   */
  async search(backupId: string, query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    const conversations = await this.listConversations(backupId);
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const conv of conversations) {
      try {
        const md = await this.getMarkdown(backupId, conv.cascadeId);
        const lines = md.split("\n");
        const matches: SearchMatch[] = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            matches.push({
              line: i + 1,
              content: lines[i].slice(0, 200),
            });
          }
        }

        if (matches.length > 0) {
          results.push({
            conversationId: conv.cascadeId,
            title: conv.title,
            matches,
          });
        }
      } catch {
        // messages.md might not exist for metadata-only conversations
      }
    }

    return results;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private backupPath(backupId: string): string {
    return join(this.rootDir, backupId);
  }

  private manifestPath(backupId: string): string {
    return join(this.backupPath(backupId), "manifest.json");
  }

  private conversationPath(backupId: string, convId: string): string {
    return join(this.backupPath(backupId), "conversations", convId);
  }
}
