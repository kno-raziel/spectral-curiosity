import type { BackupEntry } from "../../api";

const selectClass =
  "bg-bg-primary border border-border text-text-primary px-2 py-1 rounded text-[11px] font-sans";
const btnGhost =
  "px-4 py-1.5 border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 font-sans bg-border text-text-primary hover:bg-[#30363d]";

interface DiffControlsProps {
  backups: BackupEntry[];
  selectedA: string;
  selectedB: string;
  diffLoading: boolean;
  onSelectA: (v: string) => void;
  onSelectB: (v: string) => void;
  onDiff: () => void;
}

const formatDate = (iso: string) => new Date(iso).toLocaleString();

export function DiffControls({
  backups,
  selectedA,
  selectedB,
  diffLoading,
  onSelectA,
  onSelectB,
  onDiff,
}: DiffControlsProps) {
  return (
    <div className="flex gap-2.5 items-center flex-wrap mb-3">
      <label className="text-xs text-text-secondary">
        Compare:
        <select
          className={selectClass}
          value={selectedA}
          onChange={(e) => onSelectA(e.target.value)}
        >
          <option value="current">Current</option>
          {backups.map((b) => (
            <option key={`a-${b.timestamp}`} value={b.path}>
              {formatDate(b.date)}
            </option>
          ))}
        </select>
      </label>
      <span className="text-text-muted text-base">→</span>
      <label className="text-xs text-text-secondary">
        With:
        <select
          className={selectClass}
          value={selectedB}
          onChange={(e) => onSelectB(e.target.value)}
        >
          <option value="current">Current</option>
          {backups.map((b) => (
            <option key={`b-${b.timestamp}`} value={b.path}>
              {formatDate(b.date)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={btnGhost} onClick={onDiff} disabled={diffLoading}>
        {diffLoading ? "Loading..." : "🔍 Diff"}
      </button>
    </div>
  );
}
