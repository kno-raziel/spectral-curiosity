import { useMemo, useState } from "react";
import type { Artifact } from "../../../shared/types";
import { ArtifactViewer } from "./ArtifactViewer";

interface ArtifactListProps {
  artifacts: Artifact[];
  conversationId: string;
}

type SortOrder = "date-desc" | "date-asc";

export function ArtifactList({ artifacts, conversationId }: ArtifactListProps) {
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("date-desc");

  const sortedArtifacts = useMemo(() => {
    const list = [...artifacts];
    
    // Always group by type
    const mds = list.filter((a) => a.name.endsWith(".md"));
    const imgs = list.filter((a) => /\.(png|jpe?g|gif|webp|svg)$/i.test(a.name));
    const others = list.filter((a) => !a.name.endsWith(".md") && !/\.(png|jpe?g|gif|webp|svg)$/i.test(a.name));

    // Sort strictly within the groups based on selection
    const sortFn = (a: Artifact, b: Artifact) => 
      sortOrder === "date-desc" ? b.date - a.date : a.date - b.date;

    mds.sort(sortFn);
    imgs.sort(sortFn);
    others.sort(sortFn);
      
    return [...mds, ...imgs, ...others];
  }, [artifacts, sortOrder]);

  if (artifacts.length === 0) {
    return (
      <div className="text-xs text-text-muted italic">No brain artifacts for this conversation</div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2">
        <div className="text-xs font-medium text-text-secondary">
          <span className="text-accent-blue">{artifacts.length}</span> artefactos
        </div>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="bg-bg-tertiary border border-border text-xs rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent-blue font-mono appearance-none pr-6 custom-select"
          style={{ backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '12px' }}
        >
          <option value="date-desc">Recientes primero</option>
          <option value="date-asc">Antiguos primero</option>
        </select>
      </div>

      {sortedArtifacts.map((a) => (
        <button
          key={a.name}
          type="button"
          className="border border-border rounded-md px-3 py-2.5 mb-2 bg-bg-secondary w-full text-left cursor-pointer transition-all duration-150 hover:border-accent-blue hover:bg-bg-tertiary/50 font-inherit"
          onClick={() => setSelectedArtifact(a.name)}
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
        </button>
      ))}

      {selectedArtifact && (
        <ArtifactViewer
          conversationId={conversationId}
          artifactName={selectedArtifact}
          onClose={() => setSelectedArtifact(null)}
        />
      )}
    </>
  );
}
