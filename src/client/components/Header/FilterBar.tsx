import type { WorkspaceEntry } from "../../../shared/types";

interface FilterBarProps {
  filter: string;
  search: string;
  bulkWs: string;
  workspaces: WorkspaceEntry[];
  onFilterChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onBulkWsChange: (v: string) => void;
  onBulkApply: () => void;
}

export function FilterBar({
  filter,
  search,
  bulkWs,
  workspaces,
  onFilterChange,
  onSearchChange,
  onBulkWsChange,
  onBulkApply,
}: FilterBarProps) {
  const selectClass =
    "bg-bg-secondary border border-border text-text-primary px-2.5 py-1.5 rounded-md text-xs font-sans focus:outline-none focus:border-accent-blue";
  const inputClass =
    "bg-bg-secondary border border-border text-text-primary px-2.5 py-1.5 rounded-md text-xs font-sans w-[260px] focus:outline-none focus:border-accent-blue";

  return (
    <div className="px-8 py-2.5 flex gap-2.5 flex-wrap items-center border-b border-border sticky top-[53px] z-99 bg-bg-primary">
      <label className="text-xs text-text-secondary">
        Filter:
        <select
          className={selectClass}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        >
          <option value="all">All conversations</option>
          <option value="unassigned">Unassigned only</option>
          <option value="assigned">Assigned only</option>
          <option value="changed">Changed only</option>
          {workspaces.map((w) => (
            <option key={`f-${w.name}`} value={w.name}>
              ws: {w.name}
            </option>
          ))}
        </select>
      </label>
      <input
        type="text"
        className={inputClass}
        placeholder="Search title, artifacts..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div className="flex gap-1.5 items-center ml-auto">
        <label className="text-xs text-text-secondary">
          Bulk:
          <select
            className={selectClass}
            value={bulkWs}
            onChange={(e) => onBulkWsChange(e.target.value)}
          >
            <option value="">—</option>
            {workspaces.map((w) => (
              <option key={`b-${w.name}`} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="px-4 py-1.5 border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 font-sans bg-border text-text-primary hover:bg-[#30363d]"
          onClick={onBulkApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
