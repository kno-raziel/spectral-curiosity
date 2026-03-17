/** Shared types for server, extension, and client */

export interface Artifact {
  name: string;
  title: string;
  summary: string;
  preview: string;
  size: number;
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
