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

  // ── Brain Explorer ──────────────────────────────────────────────────────

  /** Get the file tree for a conversation's brain folder */
  async getBrainTree(backupId: string, convId: string): Promise<FileTreeNode[]> {
    const brainDir = join(this.backupPath(backupId), "brain", convId);
    return this.buildFileTree(brainDir, "");
  }

  /** Check if a conversation has a brain folder */
  async hasBrain(backupId: string, convId: string): Promise<boolean> {
    const brainDir = join(this.backupPath(backupId), "brain", convId);
    try {
      const s = await stat(brainDir);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  /** Read a file from a conversation's brain folder */
  async readBrainFile(
    backupId: string,
    convId: string,
    filePath: string,
  ): Promise<BrainFileResult> {
    // Sanitize: prevent path traversal
    const safe = filePath.replace(/\.\./g, "");
    const fullPath = join(this.backupPath(backupId), "brain", convId, safe);
    const s = await stat(fullPath);
    const ext = fullPath.split(".").pop()?.toLowerCase() ?? "";

    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      md: "text/markdown",
      json: "application/json",
      txt: "text/plain",
    };

    return {
      path: fullPath,
      size: s.size,
      mimeType: mimeMap[ext] ?? "application/octet-stream",
      isText: ["md", "json", "txt", "log"].includes(ext),
    };
  }

  // ── Knowledge Base ──────────────────────────────────────────────────────

  /** List all knowledge topics with their metadata and artifact tree */
  async getKnowledgeTopics(backupId: string): Promise<KnowledgeTopic[]> {
    const knowledgeDir = join(this.backupPath(backupId), "knowledge");
    let entries: string[];
    try {
      entries = await readdir(knowledgeDir);
    } catch {
      return [];
    }

    const topics: KnowledgeTopic[] = [];

    for (const name of entries) {
      const topicDir = join(knowledgeDir, name);
      const topicStat = await stat(topicDir).catch(() => null);
      if (!topicStat?.isDirectory()) continue;

      // Read metadata.json
      const metadataPath = join(topicDir, "metadata.json");
      try {
        const raw = await readFile(metadataPath, "utf-8");
        const meta = JSON.parse(raw) as KnowledgeMetadata;

        // Build recursive file tree for artifacts
        const artifactsDir = join(topicDir, "artifacts");
        const artifactTree = await this.buildFileTree(artifactsDir, "");

        topics.push({
          id: name,
          title: meta.title ?? name,
          summary: meta.summary ?? "",
          references: meta.references ?? [],
          artifactTree,
        });
      } catch {
        // No valid metadata — skip
      }
    }

    return topics.sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Read a knowledge artifact file (supports nested paths like case_studies/file.md) */
  async readKnowledgeArtifact(
    backupId: string,
    topicId: string,
    filename: string,
  ): Promise<string> {
    const safe = filename.replace(/\.\./g, "");
    const filePath = join(this.backupPath(backupId), "knowledge", topicId, "artifacts", safe);
    return readFile(filePath, "utf-8");
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

  /** Recursively build a file tree for a directory */
  private async buildFileTree(dirPath: string, relativePath: string): Promise<FileTreeNode[]> {
    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      return [];
    }

    const nodes: FileTreeNode[] = [];

    for (const name of entries.sort()) {
      // Skip hidden files and .DS_Store
      if (name.startsWith(".")) continue;

      const fullPath = join(dirPath, name);
      const relPath = relativePath ? `${relativePath}/${name}` : name;
      const s = await stat(fullPath).catch(() => null);
      if (!s) continue;

      if (s.isDirectory()) {
        const children = await this.buildFileTree(fullPath, relPath);
        nodes.push({ name, path: relPath, type: "directory", children });
      } else {
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        nodes.push({
          name,
          path: relPath,
          type: "file",
          size: s.size,
          ext,
        });
      }
    }

    return nodes;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  ext?: string;
  children?: FileTreeNode[];
}

export interface BrainFileResult {
  path: string;
  size: number;
  mimeType: string;
  isText: boolean;
}

export interface KnowledgeMetadata {
  title?: string;
  summary?: string;
  references?: Array<{ type: string; value: string }>;
}

export interface KnowledgeTopic {
  id: string;
  title: string;
  summary: string;
  references: Array<{ type: string; value: string }>;
  artifactTree: FileTreeNode[];
}
