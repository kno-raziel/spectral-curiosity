/**
 * Brain Explorer — tree-based file viewer for a conversation's brain folder.
 *
 * Shows the raw files stored by Antigravity:
 * - .md artifacts (task.md, implementation_plan.md, etc.)
 * - .png / .webp screenshots and generated images
 * - .metadata.json files
 * - .system_generated/ logs
 */

import { useState } from "react";
import type { FileTreeNode } from "../../../shared/backup-reader";
import { brainFileUrl, fetchBrainFileContent } from "../../api";
import { useBrainTree } from "../../hooks/useBackups";

interface BrainExplorerProps {
  backupId: string;
  conversationId: string;
}

export function BrainExplorer({ backupId, conversationId }: BrainExplorerProps) {
  const { tree, loading, error } = useBrainTree(backupId, conversationId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const handleFileClick = async (node: FileTreeNode) => {
    if (node.type === "directory") return;
    setSelectedFile(node.path);

    const isImage = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(node.ext ?? "");
    if (isImage) {
      setFileContent(null); // images rendered via <img> tag
      return;
    }

    setFileLoading(true);
    try {
      const content = await fetchBrainFileContent(backupId, conversationId, node.path);
      setFileContent(content);
    } catch {
      setFileContent("(Failed to load file content)");
    } finally {
      setFileLoading(false);
    }
  };

  const selectedExt = selectedFile?.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(selectedExt);

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

  if (tree.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-md p-6 text-center">
        <p className="text-text-muted text-[13px]">No brain data found for this conversation.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* Left: Tree */}
      <div className="w-[280px] shrink-0 bg-bg-secondary border border-border rounded-lg p-3 overflow-y-auto max-h-[70vh]">
        <p className="text-[11px] text-text-muted font-semibold mb-2 uppercase tracking-wider">
          File Tree
        </p>
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedFile}
            onSelect={handleFileClick}
          />
        ))}
      </div>

      {/* Right: Preview */}
      <div className="flex-1 bg-bg-secondary border border-border rounded-lg p-4 overflow-auto max-h-[70vh]">
        {!selectedFile ? (
          <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
            <p>Select a file to preview</p>
          </div>
        ) : fileLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 rounded-full border-[3px] border-border border-t-accent-blue animate-[spin_0.8s_linear_infinite]" />
          </div>
        ) : isImage ? (
          <div>
            <p className="text-[11px] text-text-muted font-mono mb-3">{selectedFile}</p>
            <img
              src={brainFileUrl(backupId, conversationId, selectedFile)}
              alt={selectedFile}
              className="max-w-full rounded-md border border-border"
            />
          </div>
        ) : (
          <div>
            <p className="text-[11px] text-text-muted font-mono mb-3">{selectedFile}</p>
            <pre className="text-[12px] text-text-primary whitespace-pre-wrap wrap-break-word font-mono leading-relaxed">
              {fileContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tree Node Component ─────────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (node: FileTreeNode) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isSelected = selectedPath === node.path;
  const ext = node.ext ?? "";

  const icon = isDir ? (open ? "📂" : "📁") : fileIcon(ext);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isDir) setOpen(!open);
          else onSelect(node);
        }}
        className={`flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded text-[12px] cursor-pointer bg-transparent border-none font-sans transition-colors ${
          isSelected
            ? "bg-accent-blue/15 text-accent-blue"
            : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <span className="text-[10px] shrink-0">{icon}</span>
        <span className="truncate">{node.name}</span>
        {!isDir && node.size !== undefined && (
          <span className="text-[9px] text-text-muted ml-auto shrink-0">
            {formatBytes(node.size)}
          </span>
        )}
      </button>
      {isDir && open && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function fileIcon(ext: string): string {
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "🖼️";
  if (ext === "md") return "📝";
  if (ext === "json") return "📋";
  if (ext === "txt" || ext === "log") return "📄";
  return "📄";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
