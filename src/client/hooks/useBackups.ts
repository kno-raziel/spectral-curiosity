/**
 * React hooks for the Backup Viewer.
 */

import { useCallback, useEffect, useState } from "react";
import type { ConversationBackupMeta } from "../../shared/backup-format";
import type { BackupSummary, SearchResult } from "../../shared/backup-reader-types";
import type { FullTrajectory } from "../../shared/trajectory-types";
import {
  fetchBackupConversations,
  fetchBackupList,
  fetchBackupSearch,
  fetchBackupTrajectory,
} from "../api";

export function useBackupList() {
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBackupList()
      .then(setBackups)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return { backups, loading, error };
}

export function useConversationList(backupId: string | null) {
  const [conversations, setConversations] = useState<ConversationBackupMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backupId) {
      setConversations([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetchBackupConversations(backupId)
      .then(setConversations)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [backupId]);

  return { conversations, loading, error };
}

export function useTrajectory(backupId: string | null, convId: string | null) {
  const [trajectory, setTrajectory] = useState<FullTrajectory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backupId || !convId) {
      setTrajectory(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchBackupTrajectory(backupId, convId)
      .then(setTrajectory)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [backupId, convId]);

  return { trajectory, loading, error };
}

export function useBackupSearch(backupId: string | null) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const search = useCallback(
    (q: string) => {
      setQuery(q);
      if (!backupId || !q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      fetchBackupSearch(backupId, q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    },
    [backupId],
  );

  return { results, loading, query, search };
}
