import type { Artifact } from "../../../shared/types";

interface ArtifactListProps {
  artifacts: Artifact[];
}

export function ArtifactList({ artifacts }: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <div className="text-xs text-text-muted italic">No brain artifacts for this conversation</div>
    );
  }

  return (
    <>
      {artifacts.map((a) => (
        <div
          key={a.name}
          className="border border-border rounded-md px-3 py-2.5 mb-2 bg-bg-secondary"
        >
          <div className="text-[11px] font-mono text-accent-blue mb-1">
            📄 {a.name} ({Math.round(a.size / 1024)} KB)
          </div>
          <div className="text-[13px] font-medium mb-1">{a.title}</div>
          {a.summary && (
            <div className="text-xs text-accent-purple mb-1.5 leading-relaxed">💡 {a.summary}</div>
          )}
          {a.preview && (
            <pre className="text-[11px] text-text-secondary whitespace-pre-wrap leading-snug max-h-[120px] overflow-y-auto font-mono bg-transparent border-none m-0 p-0">
              {a.preview}
            </pre>
          )}
        </div>
      ))}
    </>
  );
}
