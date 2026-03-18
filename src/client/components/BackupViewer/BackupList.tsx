/**
 * Backup list — shows all available backup directories as cards.
 * Includes a directory path input bar to change the backup source at runtime.
 */

import { useEffect, useState } from "react";
import { fetchBackupConfig, setBackupDir } from "../../api";
import { useBackupList } from "../../hooks/useBackups";

interface BackupListProps {
  onSelect: (backupId: string) => void;
}

export function BackupList({ onSelect }: BackupListProps) {
  const { backups, loading, error, reload } = useBackupList();
  const [dirInput, setDirInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  // Load current backup directory on mount
  useEffect(() => {
    fetchBackupConfig()
      .then((cfg) => setDirInput(cfg.directory))
      .catch(() => {
        /* ignore */
      });
  }, []);

  const handleChangeDir = async () => {
    if (!dirInput.trim()) return;
    setSaving(true);
    setDirError(null);
    try {
      await setBackupDir(dirInput.trim());
      reload();
    } catch (err) {
      setDirError(err instanceof Error ? err.message : "Failed to change directory");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Directory config bar */}
      <div className="bg-bg-secondary border border-border rounded-lg p-3">
        <label
          htmlFor="backup-dir-input"
          className="text-[11px] text-text-muted font-semibold uppercase tracking-wider mb-2 block"
        >
          Backup Directory
        </label>
        <div className="flex gap-2">
          <input
            id="backup-dir-input"
            type="text"
            value={dirInput}
            onChange={(e) => setDirInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleChangeDir()}
            placeholder="/path/to/backups"
            className="flex-1 bg-bg-primary border border-border rounded-md px-3 py-1.5 text-[13px] text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
          />
          <button
            type="button"
            onClick={handleChangeDir}
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-[12px] font-medium bg-accent-blue text-white border-none cursor-pointer hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-sans"
          >
            {saving ? "Loading…" : "Load"}
          </button>
        </div>
        {dirError && <p className="text-accent-red text-[11px] mt-2">{dirError}</p>}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-text-secondary">
          <div className="w-8 h-8 rounded-full border-[3px] border-border border-t-accent-purple animate-[spin_0.8s_linear_infinite]" />
          <p>Scanning backup directories…</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-secondary">
          <p className="text-accent-red font-medium">Error: {error}</p>
          <p className="text-[12px] text-text-muted">
            Check the path above and click <strong>Load</strong>.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && backups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-secondary">
          <p className="text-[40px]">📭</p>
          <p className="font-medium">No backups found</p>
          <p className="text-[12px] text-text-muted max-w-[400px] text-center">
            Run <strong>"Spectral: Backup Now"</strong> from the Command Palette in Antigravity, or
            point to a different directory above.
          </p>
        </div>
      )}

      {/* Backup cards */}
      {!loading && !error && backups.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
            📦 Backups ({backups.length})
          </h2>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {backups.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelect(b.id)}
                className="text-left bg-bg-secondary border border-border rounded-lg p-4 cursor-pointer transition-all duration-150 hover:border-border-hover hover:bg-bg-tertiary group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold text-text-primary group-hover:text-accent-blue transition-colors">
                    {formatDate(b.createdAt)}
                  </span>
                  <span className="text-[11px] text-text-muted font-mono bg-bg-primary px-2 py-0.5 rounded">
                    {b.strategy}
                  </span>
                </div>
                <div className="flex gap-4 text-[12px] text-text-secondary">
                  <span>💬 {b.conversationCount} conversations</span>
                  <span>💾 {formatSize(b.totalSizeBytes)}</span>
                </div>
                <p className="text-[11px] text-text-muted mt-2 font-mono truncate">{b.id}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}
