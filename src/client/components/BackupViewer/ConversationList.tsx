/**
 * Conversation list within a backup — searchable, sortable.
 */

import { useMemo, useState } from "react";
import { useConversationList } from "../../hooks/useBackups";

interface ConversationListProps {
  backupId: string;
  onSelect: (convId: string, title: string) => void;
  onBack: () => void;
}

export function ConversationList({ backupId, onSelect, onBack }: ConversationListProps) {
  const { conversations, loading, error } = useConversationList(backupId);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || c.cascadeId.toLowerCase().includes(q),
    );
  }, [conversations, search]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] text-text-secondary hover:text-accent-blue transition-colors cursor-pointer bg-transparent border-none font-sans"
        >
          ← Backups
        </button>
        <span className="text-text-muted">/</span>
        <span className="text-[13px] font-semibold text-accent-purple truncate max-w-[300px]">
          {backupId}
        </span>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search conversations…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted mb-4 outline-none focus:border-accent-blue transition-colors font-sans"
      />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-secondary">
          <div className="w-6 h-6 rounded-full border-[3px] border-border border-t-accent-purple animate-[spin_0.8s_linear_infinite]" />
        </div>
      ) : error ? (
        <p className="text-accent-red text-[13px] py-4">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-text-secondary text-[13px] py-8 text-center">
          {search ? "No conversations match your search" : "No conversations in this backup"}
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] text-text-muted mb-2">
            {filtered.length} conversation{filtered.length !== 1 ? "s" : ""}
          </p>
          {filtered.map((c) => (
            <button
              key={c.cascadeId}
              type="button"
              onClick={() => onSelect(c.cascadeId, c.title)}
              className="w-full text-left bg-bg-secondary border border-border rounded-md px-4 py-3 cursor-pointer transition-all duration-150 hover:border-border-hover hover:bg-bg-tertiary group flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-text-primary truncate group-hover:text-accent-blue transition-colors">
                  {c.title || "(untitled)"}
                </p>
                <div className="flex gap-3 mt-1 text-[11px] text-text-muted">
                  <span>{formatDate(c.lastModifiedTime)}</span>
                  <span>{c.stepCount} steps</span>
                  {!c.includes.trajectory && (
                    <span className="text-accent-orange">⚠️ metadata only</span>
                  )}
                </div>
              </div>
              <span className="text-text-muted text-[11px] group-hover:text-accent-blue transition-colors">
                →
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}
