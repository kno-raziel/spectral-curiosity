import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation, WorkspaceEntry } from "../../shared/types";
import { fetchConversations, fetchWorkspaces } from "../api";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const changesRef = useRef(changes);
  const renamesRef = useRef(renames);
  changesRef.current = changes;
  renamesRef.current = renames;

  const load = useCallback(async () => {
    try {
      const [convs, wss] = await Promise.all([fetchConversations(), fetchWorkspaces()]);
      setConversations(convs);
      setWorkspaces(wss);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 10s when no pending changes
  useEffect(() => {
    const interval = setInterval(() => {
      const hasPending =
        Object.keys(changesRef.current).length > 0 || Object.keys(renamesRef.current).length > 0;
      if (!hasPending) {
        fetchConversations()
          .then(setConversations)
          .catch(() => {});
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const assign = useCallback(
    (id: string, workspace: string) => {
      setChanges((prev) => {
        const conv = conversations.find((c) => c.id === id);
        if (conv && workspace === conv.workspace) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: workspace };
      });
    },
    [conversations],
  );

  const rename = useCallback(
    (id: string, newTitle: string) => {
      setRenames((prev) => {
        const conv = conversations.find((c) => c.id === id);
        if (conv && newTitle === conv.title) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: newTitle };
      });
    },
    [conversations],
  );

  const applyChanges = useCallback(() => {
    setConversations((prev) =>
      prev.map((c) => {
        let updated = c;
        if (changes[c.id] !== undefined) {
          updated = { ...updated, workspace: changes[c.id] };
        }
        if (renames[c.id] !== undefined) {
          updated = { ...updated, title: renames[c.id] };
        }
        return updated;
      }),
    );
    setChanges({});
    setRenames({});
  }, [changes, renames]);

  const pendingCount = Object.keys(changes).length + Object.keys(renames).length;

  return {
    conversations,
    workspaces,
    changes,
    renames,
    pendingCount,
    loading,
    error,
    assign,
    rename,
    applyChanges,
    reload: load,
  };
}
