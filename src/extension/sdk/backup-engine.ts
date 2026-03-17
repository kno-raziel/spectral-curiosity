/**
 * Backup engine — orchestrates full/incremental conversation backups.
 *
 * Design principles:
 * - Streaming writes: each conversation written to disk immediately
 * - Atomic: writes to a temp dir, renames on success
 * - Resilient: per-conversation errors don't abort the backup
 * - Throttled: 100ms delay between RPC calls to avoid saturating the LS
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TOOL_NAME,
  type BackupManifest,
  type BackupPhase,
  type BackupResult,
  type BackupStrategy,
  type ConversationBackupMeta,
  type ProgressCallback,
} from "../../shared/backup-format";
import { parseSnapshotEntries } from "../../shared/backups";
import { BRAIN_DIR, DB_PATH, GEMINI_DIR } from "../../shared/paths";
import type { SnapshotConversation } from "../../shared/types";
import type { LsClient } from "./ls-client";
import type { CascadeEntry } from "./ls-types";
import { renderTrajectoryMarkdown } from "./markdown-export";

// node-sqlite3-wasm is handled by the `optionalExternals` esbuild plugin,
// which wraps the require in try/catch at build time. The lazy loader here
// is still needed because the module is loaded on-demand (not at activation).

/** Minimal typed interface for the subset of node-sqlite3-wasm we use */
interface SqliteDatabase {
  get(sql: string, params?: unknown[]): Record<string, unknown> | null;
  close(): void;
}

interface SqliteModule {
  Database: new (path: string, opts?: { readOnly?: boolean }) => SqliteDatabase;
}

/** Lazy-load node-sqlite3-wasm. Returns null if unavailable. */
function loadSqlite(): SqliteModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node-sqlite3-wasm") as SqliteModule;
  } catch {
    return null;
  }
}

/** Extension version — injected from package.json at build time */
const TOOL_VERSION = "0.1.0";

/** Delay between RPC calls to avoid saturating the Language Server */
const THROTTLE_MS = 100;

export interface BackupEngineOptions {
  /** Destination directory for backups (e.g. ~/antigravity-backups) */
  backupDir: string;
  /** Backup strategy */
  strategy: BackupStrategy;
  /** Max backups to keep (rotation). 0 = no rotation */
  maxBackups: number;
  /** Include brain/ directory */
  includeBrain: boolean;
  /** Include knowledge/ directory */
  includeKnowledge: boolean;
  /** Include skills/ and workflows/ directories */
  includeSkills: boolean;
  /** Include token/model metadata per conversation */
  includeTokenMetadata: boolean;
  /**
   * Auto-backup mode: uses a fixed directory name (`spectral-auto-backup`)
   * that is overwritten on each run, and skips rotation.
   * Used by BackupScheduler to avoid unbounded disk usage.
   */
  autoBackupMode: boolean;
  /** Logger function */
  log: (msg: string) => void;
  /** Progress callback */
  onProgress?: ProgressCallback;
}

export class BackupEngine {
  constructor(
    private readonly lsClient: LsClient,
    private readonly options: BackupEngineOptions,
  ) {}

  /**
   * Run a full or incremental backup.
   */
  async run(): Promise<BackupResult> {
    const startTime = Date.now();
    const { log, onProgress, strategy, backupDir } = this.options;
    const errors: Record<string, string> = {};

    // Ensure backup directory exists
    mkdirSync(backupDir, { recursive: true });

    // ── Phase 1: List conversations ──────────────────────────────────
    log("Listing conversations...");
    onProgress?.({
      phase: "listing",
      current: 0,
      total: 0,
      label: "Fetching conversation index",
      bytesWritten: 0,
    });

    const cascades = await this.lsClient.listCascades();
    let cascadeIds = Object.keys(cascades);

    // -- Database fallback to bypass the 10-item listCascades limit --
    try {
      const sqlite = loadSqlite();
      if (sqlite && existsSync(DB_PATH)) {
        const db = new sqlite.Database(DB_PATH, { readOnly: true });
        try {
          const row = db.get("SELECT value FROM ItemTable WHERE key = ?", [
            "antigravityUnifiedStateSync.trajectorySummaries",
          ]) as { value: string } | null;

          if (row?.value) {
            const decoded = new Uint8Array(Buffer.from(row.value, "base64"));
            const entries: SnapshotConversation[] = parseSnapshotEntries(decoded);
            const dbIds = entries.map((e) => e.id);

            log(`Found ${dbIds.length} conversations in local database (bypassing LS limit)`);
            cascadeIds = [...new Set([...cascadeIds, ...dbIds])];

            // Fill metadata for the DB IDs not already in `cascades`
            for (const entry of entries) {
              if (!cascades[entry.id]) {
                cascades[entry.id] = buildFallbackCascadeEntry(entry);
              }
            }
          }
        } finally {
          db.close();
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Warning: Failed to query local database for extra conversations: ${msg}`);
    }

    log(`Total identified conversations to process: ${cascadeIds.length}`);

    // ── Phase 2: Filter (incremental) ────────────────────────────────
    const previousManifest = this.loadPreviousManifest();
    let toExport = cascadeIds;
    let skippedCount = 0;

    if (strategy === "incremental" && previousManifest) {
      const previousMetas = this.loadPreviousMetadata(previousManifest);
      toExport = cascadeIds.filter((id) => {
        const current = cascades[id];
        const previous = previousMetas.get(id);
        if (!previous) return true; // new conversation
        return current.lastModifiedTime !== previous.lastModifiedTime;
      });
      skippedCount = cascadeIds.length - toExport.length;
      log(`Incremental: ${toExport.length} modified, ${skippedCount} unchanged`);
    }

    // ── Phase 3: Create temp backup directory ────────────────────────
    const autoMode = this.options.autoBackupMode;
    const finalName = autoMode
      ? "spectral-auto-backup"
      : `spectral-backup-${new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "")}`;
    const tempName = `.backup-in-progress-${Date.now()}`;
    const tempDir = join(backupDir, tempName);
    const finalDir = join(backupDir, finalName);

    mkdirSync(join(tempDir, "conversations"), { recursive: true });

    // ── Phase 4: Export conversations ────────────────────────────────
    let exportedCount = 0;
    let totalBytes = 0;
    let purgedCount = 0;
    let metadataOnlyCount = 0;

    for (let i = 0; i < toExport.length; i++) {
      const cascadeId = toExport[i];
      const entry = cascades[cascadeId];
      const label = truncateTitle(entry.summary, 50);

      onProgress?.({
        phase: "exporting",
        current: i + 1,
        total: toExport.length,
        label,
        bytesWritten: totalBytes,
      });

      try {
        const result = await this.exportConversation(tempDir, cascadeId, entry);
        totalBytes += result.bytes;
        exportedCount++;
        if (result.hasSteps) {
          log(`  ✅ [${i + 1}/${toExport.length}] "${label}" (${formatBytes(result.bytes)})`);
        } else {
          metadataOnlyCount++;
          log(
            `  ⚠️ [${i + 1}/${toExport.length}] "${label}" (${formatBytes(result.bytes)}) — metadata only, messages pending recovery`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);

        // Detect conversations purged by Antigravity (LS no longer has the data)
        if (msg.includes("trajectory not found")) {
          purgedCount++;
          log(
            `  ⏭️ [${i + 1}/${toExport.length}] "${label}" — skipped (deleted by Antigravity, no data available)`,
          );
        } else {
          errors[cascadeId] = msg;
          log(`  ❌ [${i + 1}/${toExport.length}] "${label}": ${msg}`);
        }
      }

      // Throttle between conversations
      if (i < toExport.length - 1) {
        await sleep(THROTTLE_MS);
      }
    }

    // ── Phase 5: Copy filesystem directories ─────────────────────────
    totalBytes += this.copyDirectories(tempDir, totalBytes);

    // ── Phase 6: Write manifest (commit marker — LAST) ───────────────
    onProgress?.({
      phase: "finalizing",
      current: 1,
      total: 1,
      label: "Writing manifest",
      bytesWritten: totalBytes,
    });

    const manifest: BackupManifest = {
      version: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      tool: BACKUP_TOOL_NAME,
      toolVersion: TOOL_VERSION,
      conversationCount: exportedCount,
      totalSizeBytes: totalBytes,
      strategy,
      sourcePaths: {
        conversations: GEMINI_DIR,
        brain: BRAIN_DIR,
        knowledge: join(GEMINI_DIR, "knowledge"),
      },
      errors,
      skippedCount: skippedCount + purgedCount,
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    writeFileSync(join(tempDir, "manifest.json"), manifestJson, "utf8");
    totalBytes += Buffer.byteLength(manifestJson, "utf8");

    // ── Phase 7: Atomic swap ────────────────────────────────────────
    if (autoMode && existsSync(finalDir)) {
      // Atomic swap: move old out, move new in, then delete old.
      // Avoids ENOTEMPTY race with Spotlight / system indexers.
      const staleDir = `${finalDir}.old-${Date.now()}`;
      renameSync(finalDir, staleDir);
      renameSync(tempDir, finalDir);
      rmSync(staleDir, { recursive: true, force: true });
    } else {
      renameSync(tempDir, finalDir);
    }
    log(`Backup saved to: ${finalDir}`);

    // ── Phase 8: Rotate old backups (on-demand only) ─────────────────
    if (!autoMode) {
      this.rotateBackups();
    }

    const durationMs = Date.now() - startTime;
    const failedCount = Object.keys(errors).length;
    const parts = [`${exportedCount} exported`];
    if (failedCount > 0) parts.push(`${failedCount} failed`);
    if (skippedCount > 0) parts.push(`${skippedCount} unchanged`);
    if (purgedCount > 0) parts.push(`${purgedCount} unavailable (deleted by Antigravity)`);
    if (metadataOnlyCount > 0)
      parts.push(`${metadataOnlyCount} metadata only (full messages pending recovery)`);
    log(`Done in ${(durationMs / 1000).toFixed(1)}s — ${parts.join(", ")}`);

    return {
      success: true,
      backupPath: finalDir,
      exportedCount,
      failedCount,
      skippedCount: skippedCount + purgedCount,
      totalSizeBytes: totalBytes,
      durationMs,
      errors,
    };
  }

  // ── Private: Export a single conversation ───────────────────────────

  private async exportConversation(
    tempDir: string,
    cascadeId: string,
    entry: CascadeEntry,
  ): Promise<{ bytes: number; hasSteps: boolean }> {
    const convDir = join(tempDir, "conversations", cascadeId);
    mkdirSync(convDir, { recursive: true });
    let totalBytes = 0;

    // 1. Trajectory
    const trajectory = await this.lsClient.getTrajectory(cascadeId);
    const hasSteps =
      Array.isArray(trajectory.trajectory?.steps) && trajectory.trajectory.steps.length > 0;
    const trajectoryJson = JSON.stringify(trajectory, null, 2);
    writeFileSync(join(convDir, "trajectory.json"), trajectoryJson, "utf8");
    const trajSize = Buffer.byteLength(trajectoryJson, "utf8");
    totalBytes += trajSize;

    await sleep(THROTTLE_MS);

    // 2. Artifacts
    let artifactCount = 0;
    try {
      const snapshots = await this.lsClient.getArtifactSnapshots(cascadeId);
      const artifactsJson = JSON.stringify(snapshots, null, 2);
      writeFileSync(join(convDir, "artifacts.json"), artifactsJson, "utf8");
      totalBytes += Buffer.byteLength(artifactsJson, "utf8");
      artifactCount = snapshots.artifactSnapshots?.length ?? 0;
    } catch {
      // Artifacts are optional — some conversations have none
      writeFileSync(
        join(convDir, "artifacts.json"),
        JSON.stringify({ artifactSnapshots: [] }, null, 2),
        "utf8",
      );
    }

    await sleep(THROTTLE_MS);

    // 3. Token metadata (optional)
    if (this.options.includeTokenMetadata) {
      try {
        const meta = await this.lsClient.getGeneratorMetadata(cascadeId);
        const metaJson = JSON.stringify(meta, null, 2);
        writeFileSync(join(convDir, "generator-metadata.json"), metaJson, "utf8");
        totalBytes += Buffer.byteLength(metaJson, "utf8");
      } catch {
        // Not critical — skip silently
      }
      await sleep(THROTTLE_MS);
    }

    // 4. Markdown export
    const markdown = renderTrajectoryMarkdown(trajectory, entry.summary);
    writeFileSync(join(convDir, "messages.md"), markdown, "utf8");
    totalBytes += Buffer.byteLength(markdown, "utf8");

    // 5. Per-conversation metadata
    const meta: ConversationBackupMeta = {
      cascadeId,
      trajectoryId: entry.trajectoryId,
      title: entry.summary,
      stepCount: entry.stepCount,
      createdTime: entry.createdTime,
      lastModifiedTime: entry.lastModifiedTime,
      workspaces: (entry.workspaces ?? []).map((w) => ({
        uri: w.workspaceFolderAbsoluteUri,
        repository: w.repository,
        branch: w.branchName,
      })),
      includes: {
        trajectory: true,
        artifacts: artifactCount > 0,
        markdown: true,
      },
      trajectorySizeBytes: trajSize,
    };

    const metaJson = JSON.stringify(meta, null, 2);
    writeFileSync(join(convDir, "metadata.json"), metaJson, "utf8");
    totalBytes += Buffer.byteLength(metaJson, "utf8");

    return { bytes: totalBytes, hasSteps };
  }

  // ── Private: Copy filesystem directories ───────────────────────────

  private copyDirectories(tempDir: string, currentBytes: number): number {
    const { log, onProgress, includeBrain, includeKnowledge, includeSkills } = this.options;
    let bytesAdded = 0;

    const dirs: Array<{ source: string; target: string; phase: BackupPhase; label: string }> = [];

    if (includeBrain && existsSync(BRAIN_DIR)) {
      dirs.push({
        source: BRAIN_DIR,
        target: join(tempDir, "brain"),
        phase: "copying-brain" as const,
        label: "brain/",
      });
    }

    const knowledgeDir = join(GEMINI_DIR, "knowledge");
    if (includeKnowledge && existsSync(knowledgeDir)) {
      dirs.push({
        source: knowledgeDir,
        target: join(tempDir, "knowledge"),
        phase: "copying-knowledge" as const,
        label: "knowledge/",
      });
    }

    const skillsDir = join(GEMINI_DIR, "skills");
    const workflowsDir = join(GEMINI_DIR, "workflows");
    if (includeSkills) {
      if (existsSync(skillsDir)) {
        dirs.push({
          source: skillsDir,
          target: join(tempDir, "skills"),
          phase: "copying-skills" as const,
          label: "skills/",
        });
      }
      if (existsSync(workflowsDir)) {
        dirs.push({
          source: workflowsDir,
          target: join(tempDir, "workflows"),
          phase: "copying-skills" as const,
          label: "workflows/",
        });
      }
    }

    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      onProgress?.({
        phase: d.phase,
        current: i + 1,
        total: dirs.length,
        label: d.label,
        bytesWritten: currentBytes + bytesAdded,
      });

      try {
        cpSync(d.source, d.target, { recursive: true, dereference: true });
        const size = dirSize(d.target);
        bytesAdded += size;
        log(`  📁 Copied ${d.label} (${formatBytes(size)})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`  ⚠️ Failed to copy ${d.label}: ${msg}`);
      }
    }

    return bytesAdded;
  }

  // ── Private: Load previous manifest for incremental ────────────────

  private loadPreviousManifest(): BackupManifest | null {
    const backups = this.listExistingBackups();
    if (backups.length === 0) return null;

    const latestDir = backups[0]; // sorted newest first
    const manifestPath = join(this.options.backupDir, latestDir, "manifest.json");

    if (!existsSync(manifestPath)) return null;

    try {
      const raw = readFileSync(manifestPath, "utf8");
      return JSON.parse(raw) as BackupManifest;
    } catch {
      return null;
    }
  }

  private loadPreviousMetadata(_manifest: BackupManifest): Map<string, ConversationBackupMeta> {
    const backups = this.listExistingBackups();
    if (backups.length === 0) return new Map();

    const latestDir = join(this.options.backupDir, backups[0]);
    const convsDir = join(latestDir, "conversations");
    if (!existsSync(convsDir)) return new Map();

    const map = new Map<string, ConversationBackupMeta>();
    try {
      const entries = readdirSync(convsDir);
      for (const entry of entries) {
        const metaPath = join(convsDir, entry, "metadata.json");
        if (existsSync(metaPath)) {
          const raw = readFileSync(metaPath, "utf8");
          const meta = JSON.parse(raw) as ConversationBackupMeta;
          map.set(meta.cascadeId, meta);
        }
      }
    } catch {
      // Corrupted previous backup — treat as full
    }

    return map;
  }

  // ── Private: Backup rotation ───────────────────────────────────────

  private rotateBackups(): void {
    const { maxBackups, log, backupDir } = this.options;
    if (maxBackups <= 0) return;

    const backups = this.listExistingBackups();
    if (backups.length <= maxBackups) return;

    const toDelete = backups.slice(maxBackups);
    for (const dir of toDelete) {
      const fullPath = join(backupDir, dir);
      try {
        rmSync(fullPath, { recursive: true, force: true });
        log(`  🗑️ Rotated old backup: ${dir}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`  ⚠️ Failed to delete old backup ${dir}: ${msg}`);
      }
    }
  }

  /**
   * List existing backup directories, sorted newest first.
   * Only includes completed backups (those with a manifest.json).
   */
  private listExistingBackups(): string[] {
    const { backupDir } = this.options;
    if (!existsSync(backupDir)) return [];

    try {
      return readdirSync(backupDir)
        .filter((d) => d.startsWith("spectral-backup-"))
        .filter((d) => {
          // Only include completed backups (with manifest)
          return existsSync(join(backupDir, d, "manifest.json"));
        })
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /**
   * Clean up any incomplete backup directories (temp dirs from failed runs).
   */
  static cleanIncomplete(backupDir: string, log: (msg: string) => void): void {
    if (!existsSync(backupDir)) return;

    try {
      const entries = readdirSync(backupDir);
      for (const entry of entries) {
        if (entry.startsWith(".backup-in-progress-")) {
          const fullPath = join(backupDir, entry);
          rmSync(fullPath, { recursive: true, force: true });
          log(`🧹 Cleaned incomplete backup: ${entry}`);
        }
      }
    } catch {
      // Best-effort cleanup
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a CascadeEntry from a SnapshotConversation (DB fallback).
 * Type-safe: if CascadeEntry changes, this will produce compile errors.
 */
function buildFallbackCascadeEntry(entry: SnapshotConversation): CascadeEntry {
  return {
    summary: entry.title || "Restored from database",
    lastModifiedTime: "",
    stepCount: 1,
    trajectoryId: entry.id,
    status: "completed",
    createdTime: "",
    workspaces: [],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function truncateTitle(title: string, maxLen: number): string {
  if (title.length <= maxLen) return title;
  return `${title.slice(0, maxLen - 1)}…`;
}

function dirSize(dirPath: string): number {
  let total = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += dirSize(fullPath);
      } else {
        total += statSync(fullPath).size;
      }
    }
  } catch {
    // Skip unreadable entries
  }
  return total;
}
