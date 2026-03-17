import { useCallback, useMemo, useState } from "react";
import { saveChanges } from "./api";
import { BackupPanel } from "./components/BackupPanel";
import { ConversationCard } from "./components/ConversationCard";
import { FilterBar, Header } from "./components/Header";
import { showToast, Toast } from "./components/Toast";
import { useConversations } from "./hooks/useConversations";

export default function App() {
  const {
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
  } = useConversations();

  const [filter, setFilter] = useState("unassigned");
  const [search, setSearch] = useState("");
  const [bulkWs, setBulkWs] = useState("");
  const [saving, setSaving] = useState(false);

  const getEffectiveWs = useCallback(
    (id: string, original: string) => (changes[id] !== undefined ? changes[id] : original),
    [changes],
  );

  const getEffectiveTitle = useCallback(
    (id: string, original: string) => (renames[id] !== undefined ? renames[id] : original),
    [renames],
  );

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();

    return conversations.filter((c) => {
      const currentWs = getEffectiveWs(c.id, c.workspace);
      const isChanged =
        (changes[c.id] !== undefined && changes[c.id] !== c.workspace) ||
        (renames[c.id] !== undefined && renames[c.id] !== c.title);
      const isAssigned = currentWs !== "";

      if (filter === "unassigned" && isAssigned) return false;
      if (filter === "assigned" && !isAssigned) return false;
      if (filter === "changed" && !isChanged) return false;
      if (
        filter !== "all" &&
        filter !== "unassigned" &&
        filter !== "assigned" &&
        filter !== "changed" &&
        currentWs !== filter
      )
        return false;

      if (searchLower) {
        const searchable = [
          c.title,
          c.brainTitle,
          ...c.artifacts.map((a) => `${a.title} ${a.summary} ${a.preview}`),
        ]
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(searchLower)) return false;
      }

      return true;
    });
  }, [conversations, changes, renames, filter, search, getEffectiveWs]);

  const stats = useMemo(() => {
    const total = conversations.length;
    const assigned = conversations.filter((c) => {
      const ws = getEffectiveWs(c.id, c.workspace);
      return ws !== "";
    }).length;
    return { total, assigned, pending: pendingCount };
  }, [conversations, pendingCount, getEffectiveWs]);

  const handleSave = useCallback(async () => {
    if (pendingCount === 0) return;
    setSaving(true);
    try {
      const result = await saveChanges({ assignments: changes, renames });
      if (result.error) {
        showToast(result.error, "error");
      } else {
        const parts: string[] = [];
        if (result.updated > 0) parts.push(`${result.updated} assigned`);
        if (result.renamed > 0) parts.push(`${result.renamed} renamed`);
        showToast(`${parts.join(", ")}! Restart Antigravity to see changes.`, "success");
        applyChanges();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }, [changes, renames, pendingCount, applyChanges]);

  const handleBulkApply = useCallback(() => {
    if (!bulkWs) return;
    for (const c of filtered) {
      assign(c.id, bulkWs);
    }
  }, [bulkWs, filtered, assign]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-text-secondary">
        <div className="w-8 h-8 rounded-full border-[3px] border-border border-t-accent-blue animate-[spin_0.8s_linear_infinite]" />
        <p>Loading conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-text-secondary">
        <p className="text-accent-red font-medium">Error: {error}</p>
        <p className="text-[11px] text-text-muted">
          Check that the server or extension host is running
        </p>
      </div>
    );
  }

  return (
    <>
      <Header
        total={stats.total}
        assigned={stats.assigned}
        pending={stats.pending}
        saving={saving}
        onSave={handleSave}
      />
      <FilterBar
        filter={filter}
        search={search}
        bulkWs={bulkWs}
        workspaces={workspaces}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
        onBulkWsChange={setBulkWs}
        onBulkApply={handleBulkApply}
      />
      <main className="max-w-[1400px] mx-auto px-8 py-3 pb-[60px]">
        {filtered.length === 0 ? (
          <p className="text-center text-text-secondary py-[60px] text-sm">
            No conversations match the filter
          </p>
        ) : (
          filtered.map((c, i) => (
            <ConversationCard
              key={c.id}
              num={i + 1}
              conversation={c}
              currentWs={getEffectiveWs(c.id, c.workspace)}
              currentTitle={getEffectiveTitle(c.id, c.title)}
              isChanged={
                (changes[c.id] !== undefined && changes[c.id] !== c.workspace) ||
                (renames[c.id] !== undefined && renames[c.id] !== c.title)
              }
              workspaces={workspaces}
              onAssign={assign}
              onRename={rename}
            />
          ))
        )}
      </main>
      <Toast />
      <BackupPanel />
    </>
  );
}
