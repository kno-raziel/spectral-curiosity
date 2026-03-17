import type { BackupEntry } from "../../api";

const thClass = "text-left px-2.5 py-1.5 text-text-muted border-b border-border font-medium";
const tdClass = "px-2.5 py-1.5 border-b border-border font-mono";

interface BackupTableProps {
  backups: BackupEntry[];
}

const formatDate = (iso: string) => new Date(iso).toLocaleString();
const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function BackupTable({ backups }: BackupTableProps) {
  return (
    <table className="w-full border-collapse text-xs mb-3">
      <thead>
        <tr>
          <th className={thClass}>Date</th>
          <th className={thClass}>Size</th>
        </tr>
      </thead>
      <tbody>
        {backups.map((b) => (
          <tr key={b.timestamp}>
            <td className={tdClass}>{formatDate(b.date)}</td>
            <td className={tdClass}>{formatSize(b.sizeBytes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
