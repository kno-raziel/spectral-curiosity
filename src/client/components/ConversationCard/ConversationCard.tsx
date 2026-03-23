import { useState } from "react";
import type { Conversation, WorkspaceEntry } from "../../../shared/types";
import { ArtifactList } from "./ArtifactList";
import { EditableTitle } from "./EditableTitle";

interface ConversationCardProps {
  num: number;
  conversation: Conversation;
  currentWs: string;
  currentTitle: string;
  isChanged: boolean;
  workspaces: WorkspaceEntry[];
  onAssign: (id: string, ws: string) => void;
  onRename: (id: string, title: string) => void;
}

export function ConversationCard({
  num,
  conversation: c,
  currentWs,
  currentTitle,
  isChanged,
  workspaces,
  onAssign,
  onRename,
}: ConversationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isAssigned = currentWs !== "";

  const borderLeft = isAssigned
    ? "border-l-[3px] border-l-accent-green"
    : "border-l-[3px] border-l-text-muted";
  const changedStyle = isChanged ? "border-accent-orange bg-[#1c1d16]" : "";

  return (
    <div
      className={`border border-border rounded-lg mb-1.5 bg-bg-secondary transition-all duration-150 overflow-hidden hover:border-border-hover ${borderLeft} ${changedStyle}`}
    >
      {/* Clickable header row */}
      <button
        type="button"
        className="grid grid-cols-[40px_1fr_auto_180px] gap-3 items-center px-3.5 py-2.5 cursor-pointer select-none w-full bg-transparent border-none text-inherit font-inherit text-left hover:bg-bg-tertiary/40"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Row number */}
        <div className="text-[11px] text-text-muted text-center tabular-nums">
          {num}
          {isChanged && (
            <>
              <br />
              <span className="inline-block px-1.5 py-px rounded-full text-[10px] bg-accent-orange/20 text-accent-orange">
                ✎
              </span>
            </>
          )}
        </div>

        {/* Title + meta */}
        <div className="min-w-0">
          <EditableTitle
            title={currentTitle}
            expanded={expanded}
            onRename={(newTitle) => onRename(c.id, newTitle)}
          />
          <div className="text-[11px] text-text-secondary mt-0.5 font-mono">
            <span className="mr-3">
              <span className="text-text-muted">id:</span> {c.id.substring(0, 8)}
            </span>
            <span className="mr-3">
              <span className="text-text-muted">date:</span> {c.date}
            </span>
            <span className="mr-3">
              <span className="text-text-muted">size:</span> {c.size} MB
            </span>
            <span className="mr-3">
              <span className="text-text-muted">artifacts:</span> {c.artifacts.length}
            </span>
          </div>
        </div>

        {/* Spacer */}
        <div />

        {/* Workspace select */}
        <fieldset
          className="border-none m-0 p-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <select
            className={`bg-bg-primary border border-border text-text-primary px-2 py-1.5 rounded-md text-xs w-full cursor-pointer font-sans focus:border-accent-blue focus:outline-none ${
              isAssigned ? "border-accent-green text-accent-green" : ""
            }`}
            value={currentWs}
            onChange={(e) => onAssign(c.id, e.target.value)}
          >
            <option value="">— none —</option>
            {workspaces.map((w) => (
              <option key={w.name} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </fieldset>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-3.5 py-3 pl-[66px] bg-bg-primary/40 animate-[slideDown_0.2s_ease]">
          <ArtifactList artifacts={c.artifacts} conversationId={c.id} />
        </div>
      )}
    </div>
  );
}
