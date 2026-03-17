/**
 * Portable backup format types.
 *
 * Shared between the extension (writer) and Bun viewer (reader).
 * These types define the on-disk backup structure produced by BackupEngine.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Current backup format schema version */
export const BACKUP_FORMAT_VERSION = "1.0.0" as const;

/** Tool identifier written into manifests */
export const BACKUP_TOOL_NAME = "spectral-curiosity" as const;

// ── Manifest ─────────────────────────────────────────────────────────────────

export interface BackupManifest {
  /** Schema version for forward compatibility */
  version: string;
  /** ISO timestamp when backup was created */
  createdAt: string;
  /** Tool that created the backup */
  tool: string;
  /** Version of the tool */
  toolVersion: string;
  /** Total number of conversations backed up */
  conversationCount: number;
  /** Total size of all backed-up files in bytes */
  totalSizeBytes: number;
  /** Backup strategy used */
  strategy: BackupStrategy;
  /** Source paths that were backed up */
  sourcePaths: {
    conversations: string;
    brain: string;
    knowledge: string;
  };
  /** Conversations that failed to export (cascadeId → error message) */
  errors: Record<string, string>;
  /** Conversations skipped because they were unchanged (incremental only) */
  skippedCount: number;
}

export type BackupStrategy = "full" | "incremental";

// ── Per-Conversation Metadata ────────────────────────────────────────────────

export interface ConversationBackupMeta {
  /** Cascade ID (primary key) */
  cascadeId: string;
  /** Trajectory ID */
  trajectoryId: string;
  /** Conversation title/summary */
  title: string;
  /** Total step count */
  stepCount: number;
  /** ISO timestamps */
  createdTime: string;
  lastModifiedTime: string;
  /** Associated workspaces */
  workspaces: Array<{
    uri: string;
    repository?: string;
    branch?: string;
  }>;
  /** What was included in this backup */
  includes: {
    trajectory: boolean;
    artifacts: boolean;
    markdown: boolean;
  };
  /** Size of trajectory.json in bytes */
  trajectorySizeBytes: number;
}

// ── Progress Reporting ───────────────────────────────────────────────────────

export type BackupPhase =
  | "listing"
  | "exporting"
  | "copying-brain"
  | "copying-knowledge"
  | "copying-skills"
  | "finalizing";

export interface BackupProgress {
  phase: BackupPhase;
  /** Current item index (1-based) */
  current: number;
  /** Total items in current phase */
  total: number;
  /** Human-readable label for current item */
  label: string;
  /** Bytes written so far */
  bytesWritten: number;
}

export type ProgressCallback = (progress: BackupProgress) => void;

// ── Result ───────────────────────────────────────────────────────────────────

export interface BackupResult {
  /** Whether the backup completed (may still have per-conversation errors) */
  success: boolean;
  /** Final backup directory path */
  backupPath: string;
  /** Number of conversations backed up successfully */
  exportedCount: number;
  /** Number of conversations that failed */
  failedCount: number;
  /** Number of conversations skipped (unchanged in incremental) */
  skippedCount: number;
  /** Total bytes written */
  totalSizeBytes: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Per-conversation errors (cascadeId → error message) */
  errors: Record<string, string>;
}
