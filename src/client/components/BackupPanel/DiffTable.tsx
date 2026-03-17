import type { DiffResult } from "../../api";

const thClass = "text-left px-2.5 py-1.5 text-text-muted border-b border-border font-medium";
const tdClass = "px-2.5 py-1.5 border-b border-border font-mono";

interface DiffTableProps {
  diff: DiffResult;
}

export function DiffTable({ diff }: DiffTableProps) {
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-text-secondary mb-2">
        {diff.changes.length === 0 ? (
          <span>No differences found</span>
        ) : (
          <span>
            {diff.changes.length} change{diff.changes.length === 1 ? "" : "s"} found
          </span>
        )}
        <span className="text-text-muted">
          {diff.labelA}: {diff.totalA} convos · {diff.labelB}: {diff.totalB} convos
        </span>
      </div>
      {diff.changes.length > 0 && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={thClass}>ID</th>
              <th className={thClass}>Field</th>
              <th className={thClass}>{diff.labelA}</th>
              <th className={thClass}>{diff.labelB}</th>
            </tr>
          </thead>
          <tbody>
            {diff.changes.map((d) => (
              <>
                {d.titleChanged && (
                  <tr key={`${d.id}-title`}>
                    <td className={`${tdClass} text-accent-blue`}>{d.id.substring(0, 8)}</td>
                    <td className={`${tdClass} text-accent-purple font-medium`}>title</td>
                    <td
                      className={`${tdClass} text-accent-red max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap`}
                    >
                      {d.titleA}
                    </td>
                    <td
                      className={`${tdClass} text-accent-green max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap`}
                    >
                      {d.titleB}
                    </td>
                  </tr>
                )}
                {d.workspaceChanged && (
                  <tr key={`${d.id}-ws`}>
                    <td className={`${tdClass} text-accent-blue`}>{d.id.substring(0, 8)}</td>
                    <td className={`${tdClass} text-accent-purple font-medium`}>workspace</td>
                    <td
                      className={`${tdClass} text-accent-red max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap`}
                    >
                      {d.workspaceA || "(none)"}
                    </td>
                    <td
                      className={`${tdClass} text-accent-green max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap`}
                    >
                      {d.workspaceB || "(none)"}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
