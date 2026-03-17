import { useCallback, useEffect, useState } from "react";
import { type BackupEntry, type DiffResult, fetchBackups, fetchDiff } from "../../api";
import { BackupTable } from "./BackupTable";
import { DiffControls } from "./DiffControls";
import { DiffTable } from "./DiffTable";

const btnGhost =
  "px-4 py-1.5 border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 font-sans bg-border text-text-primary hover:bg-[#30363d]";

export function BackupPanel() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedA, setSelectedA] = useState("current");
  const [selectedB, setSelectedB] = useState("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBackups();
      setBackups(data);
      if (data.length > 0 && !selectedB) {
        setSelectedB(data[0].path);
      }
    } catch (err) {
      console.error("Failed to load backups", err);
    } finally {
      setLoading(false);
    }
  }, [selectedB]);

  useEffect(() => {
    if (open && backups.length === 0) {
      load();
    }
  }, [open, backups.length, load]);

  const handleDiff = useCallback(async () => {
    if (!selectedA || !selectedB) return;
    setDiffLoading(true);
    try {
      const result = await fetchDiff(selectedA, selectedB);
      setDiff(result);
    } catch (err) {
      console.error("Failed to diff", err);
    } finally {
      setDiffLoading(false);
    }
  }, [selectedA, selectedB]);

  if (!open) {
    return (
      <button
        type="button"
        className={`${btnGhost} fixed bottom-6 left-6 z-200`}
        onClick={() => setOpen(true)}
      >
        📦 Backups
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 max-h-[50vh] overflow-y-auto bg-bg-secondary border-t border-border px-8 py-4 z-200 animate-[slideUp_0.2s_ease]">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-accent-purple">📦 Backups</h3>
        <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary">Loading backups...</p>
      ) : backups.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No backups found. Backups are created when you save changes.
        </p>
      ) : (
        <>
          <BackupTable backups={backups} />
          <DiffControls
            backups={backups}
            selectedA={selectedA}
            selectedB={selectedB}
            diffLoading={diffLoading}
            onSelectA={setSelectedA}
            onSelectB={setSelectedB}
            onDiff={handleDiff}
          />
          {diff && <DiffTable diff={diff} />}
        </>
      )}
    </div>
  );
}
