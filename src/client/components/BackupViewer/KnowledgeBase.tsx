/**
 * Knowledge Base — split-pane viewer for knowledge items.
 *
 * Left: collapsible tree of topics, each with a recursive artifact tree.
 * Right: markdown content viewer.
 */

import { useState } from "react";
import type { FileTreeNode, KnowledgeTopic } from "../../../shared/backup-reader";
import { fetchKnowledgeArtifact } from "../../api";
import { useKnowledgeTopics } from "../../hooks/useBackups";

interface KnowledgeBaseProps {
  backupId: string;
  onBack: () => void;
}

export function KnowledgeBase({ backupId, onBack }: KnowledgeBaseProps) {
  const { topics, loading, error } = useKnowledgeTopics(backupId);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const handleSelect = async (topicId: string, filePath: string) => {
    setSelectedTopic(topicId);
    setSelectedFile(filePath);
    setContentLoading(true);
    try {
      const md = await fetchKnowledgeArtifact(backupId, topicId, filePath);
      setContent(md);
    } catch {
      setContent("(Failed to load artifact content)");
    } finally {
      setContentLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary">
        <div className="w-6 h-6 rounded-full border-[3px] border-border border-t-accent-blue animate-[spin_0.8s_linear_infinite]" />
      </div>
    );
  }

  if (error) {
    return <p className="text-accent-red text-[13px] py-4">{error}</p>;
  }

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
      </div>
      <h2 className="text-[16px] font-semibold text-text-primary mb-1">📚 Knowledge Base</h2>
      <p className="text-[12px] text-text-muted mb-4">
        {topics.length} knowledge {topics.length === 1 ? "topic" : "topics"}
      </p>

      {topics.length === 0 ? (
        <div className="bg-bg-secondary border border-border rounded-md p-6 text-center">
          <p className="text-text-muted text-[13px]">No knowledge items found in this backup.</p>
        </div>
      ) : (
        <div className="flex gap-4 min-h-[400px]">
          {/* Left: Topic Tree */}
          <div className="w-[300px] shrink-0 bg-bg-secondary border border-border rounded-lg p-3 overflow-y-auto max-h-[70vh]">
            <p className="text-[11px] text-text-muted font-semibold mb-2 uppercase tracking-wider">
              Topics
            </p>
            {topics.map((topic) => (
              <TopicNode
                key={topic.id}
                topic={topic}
                selectedTopic={selectedTopic}
                selectedFile={selectedFile}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {/* Right: Content */}
          <div className="flex-1 bg-bg-secondary border border-border rounded-lg p-4 overflow-auto max-h-[70vh]">
            {!selectedFile ? (
              <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
                <p>Select a document to view</p>
              </div>
            ) : contentLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-5 h-5 rounded-full border-[3px] border-border border-t-accent-blue animate-[spin_0.8s_linear_infinite]" />
              </div>
            ) : (
              <div>
                <p className="text-[11px] text-text-muted font-mono mb-3">
                  {selectedTopic}/{selectedFile}
                </p>
                <div className="text-[13px] text-text-primary whitespace-pre-wrap wrap-break-word font-mono leading-relaxed">
                  {content}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Topic Node ───────────────────────────────────────────────────────────────

function TopicNode({
  topic,
  selectedTopic,
  selectedFile,
  onSelect,
}: {
  topic: KnowledgeTopic;
  selectedTopic: string | null;
  selectedFile: string | null;
  onSelect: (topicId: string, filePath: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-1">
      {/* Topic Header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 rounded text-[13px] cursor-pointer bg-transparent border-none font-sans transition-colors text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
      >
        <span className="text-[12px] shrink-0">{open ? "▼" : "▶"}</span>
        <span className="text-[13px] shrink-0">📖</span>
        <span className="font-semibold truncate">{topic.title}</span>
        <span className="text-[11px] text-text-muted ml-auto shrink-0">
          {countFiles(topic.artifactTree)}
        </span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="ml-5">
          {topic.summary && (
            <p className="text-[11px] text-text-muted px-1 py-1 leading-snug mb-1 border-l-2 border-border pl-2">
              {topic.summary.slice(0, 150)}
              {topic.summary.length > 150 ? "…" : ""}
            </p>
          )}
          {/* Recursive artifact tree */}
          {topic.artifactTree.map((node) => (
            <ArtifactTreeNode
              key={node.path}
              node={node}
              depth={0}
              topicId={topic.id}
              selectedTopic={selectedTopic}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          ))}
          {topic.artifactTree.length === 0 && (
            <p className="text-[11px] text-text-muted px-1 italic">No artifacts</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Artifact Tree Node (recursive) ──────────────────────────────────────────

function ArtifactTreeNode({
  node,
  depth,
  topicId,
  selectedTopic,
  selectedFile,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  topicId: string;
  selectedTopic: string | null;
  selectedFile: string | null;
  onSelect: (topicId: string, filePath: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isSelected = selectedTopic === topicId && selectedFile === node.path;

  const icon = isDir ? (open ? "📂" : "📁") : "📝";

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isDir) setOpen(!open);
          else onSelect(topicId, node.path);
        }}
        className={`flex items-center gap-1.5 w-full text-left py-1 px-1 rounded text-[13px] cursor-pointer bg-transparent border-none font-sans transition-colors ${
          isSelected
            ? "bg-accent-blue/15 text-accent-blue"
            : "text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <span className="text-[12px] shrink-0">{icon}</span>
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && open && node.children && (
        <div>
          {node.children.map((child) => (
            <ArtifactTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              topicId={topicId}
              selectedTopic={selectedTopic}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Count all files (recursively) in a tree */
function countFiles(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "file") count++;
    if (node.children) count += countFiles(node.children);
  }
  return count;
}
