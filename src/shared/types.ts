/** Shared types for server, extension, and client */

export interface Artifact {
  name: string;
  title: string;
  summary: string;
  preview: string;
  size: number;
  date: number;
}

export interface Conversation {
  id: string;
  title: string;
  brainTitle: string;
  date: string;
  size: number;
  artifacts: Artifact[];
  workspace: string;
  workspaceUri: string;
  /** Number of conversation turns (from protobuf F2) */
  turnCount?: number;
  /** Whether the conversation is currently active (from protobuf F5) */
  isActive?: boolean;
  /** Creation timestamp as ISO string (from protobuf F3) */
  createdAt?: string;
  /** Associated git repo slug, e.g. "user/repo" (from protobuf F9.3) */
  gitRepo?: string;
  /** Associated git branch (from protobuf F9.4) */
  gitBranch?: string;
}

export interface SaveResult {
  updated: number;
  renamed: number;
  backup: string;
  error?: string;
}

export interface SavePayload {
  assignments: Record<string, string>;
  renames: Record<string, string>;
}

export interface WorkspaceEntry {
  name: string;
  uri: string;
  gitSlug: string;
  gitRemote: string;
  branch: string;
}

/** Backup diff types */

export interface BackupEntry {
  filename: string;
  path: string;
  timestamp: number;
  date: string;
  sizeBytes: number;
}

export interface SnapshotConversation {
  id: string;
  title: string;
  workspaceUri: string;
}

export interface DiffEntry {
  id: string;
  titleA: string;
  titleB: string;
  workspaceA: string;
  workspaceB: string;
  titleChanged: boolean;
  workspaceChanged: boolean;
}

export interface DiffResult {
  labelA: string;
  labelB: string;
  changes: DiffEntry[];
  totalA: number;
  totalB: number;
}
