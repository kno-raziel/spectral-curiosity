/**
 * Types for the backup reader — browsing backed-up conversations.
 */

import type { BackupStrategy } from "./backup-format";

/** Summary of a single backup directory */
export interface BackupSummary {
  /** Directory name (e.g. "spectral-backup-2026-03-16T19-45-00") */
  id: string;
  /** Absolute path to the backup directory */
  path: string;
  /** ISO timestamp when the backup was created */
  createdAt: string;
  /** Number of conversations in this backup */
  conversationCount: number;
  /** Total size of all files in bytes */
  totalSizeBytes: number;
  /** Backup strategy used */
  strategy: BackupStrategy;
}

/** A search match within a conversation's markdown export */
export interface SearchMatch {
  /** Line number (1-based) */
  line: number;
  /** Content snippet with context */
  content: string;
}

/** Full-text search result for a conversation */
export interface SearchResult {
  /** Cascade ID of the matching conversation */
  conversationId: string;
  /** Conversation title */
  title: string;
  /** Lines that matched the query */
  matches: SearchMatch[];
}
