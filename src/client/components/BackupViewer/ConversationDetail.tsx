/**
 * Conversation detail view — renders trajectory steps as a chat-like UI.
 *
 * Mirrors the step type discriminator from markdown-export.ts but
 * renders React components instead of Markdown strings.
 *
 * Includes a toggle to switch between the Timeline and Brain Explorer views.
 */

import { useState } from "react";
import type { TrajectoryStep } from "../../../shared/trajectory-types";
import { useTrajectory } from "../../hooks/useBackups";
import { BrainExplorer } from "./BrainExplorer";

type DetailView = "timeline" | "brain";

interface ConversationDetailProps {
  backupId: string;
  conversationId: string;
  title: string;
  onBack: () => void;
}

export function ConversationDetail({
  backupId,
  conversationId,
  title,
  onBack,
}: ConversationDetailProps) {
  const { trajectory, loading, error } = useTrajectory(backupId, conversationId);
  const [view, setView] = useState<DetailView>("timeline");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] text-text-secondary hover:text-accent-blue transition-colors cursor-pointer bg-transparent border-none font-sans"
        >
          ← Conversations
        </button>
      </div>
      <h2 className="text-[16px] font-semibold text-text-primary mb-1">{title}</h2>
      {trajectory && (
        <p className="text-[11px] text-text-muted mb-3 font-mono">
          {trajectory.trajectory.steps?.length ?? 0} steps ·{" "}
          {trajectory.trajectory.cascadeId.slice(0, 8)}
        </p>
      )}

      {/* View Toggle */}
      <div className="flex gap-1 mb-4 bg-bg-secondary rounded-lg p-1 w-fit border border-border">
        {(["timeline", "brain"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all cursor-pointer border-none font-sans ${
              view === v
                ? "bg-accent-blue text-white shadow-sm"
                : "bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
            }`}
          >
            {v === "timeline" ? "💬 Timeline" : "📂 Brain Explorer"}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === "brain" ? (
        <BrainExplorer backupId={backupId} conversationId={conversationId} />
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-text-secondary">
          <div className="w-6 h-6 rounded-full border-[3px] border-border border-t-accent-blue animate-[spin_0.8s_linear_infinite]" />
        </div>
      ) : error ? (
        <p className="text-accent-red text-[13px] py-4">{error}</p>
      ) : !trajectory?.trajectory.steps?.length ? (
        <div className="bg-bg-secondary border border-border rounded-md p-6 text-center">
          <p className="text-accent-orange text-[13px] font-medium mb-1">⚠️ Steps not available</p>
          <p className="text-[12px] text-text-muted">
            This conversation's steps were not included in the backup (likely a very large
            conversation).
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {trajectory.trajectory.steps.map((step) => (
            <StepRenderer
              key={`${step.type}-${step.metadata.createdAt}-${step.metadata.executionId ?? ""}`}
              step={step}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step Renderer (discriminated by step type) ──────────────────────────────

function StepRenderer({ step }: { step: TrajectoryStep }) {
  const type = step.type.replace("CORTEX_STEP_TYPE_", "");
  const ts = formatTimestamp(step.metadata.createdAt);

  switch (type) {
    case "USER_INPUT":
      return <UserMessage step={step} timestamp={ts} />;
    case "PLANNER_RESPONSE":
      return <AssistantMessage step={step} timestamp={ts} />;
    case "TASK_BOUNDARY":
      return <TaskBoundary step={step} />;
    case "NOTIFY_USER":
      return <Notification step={step} timestamp={ts} />;
    case "RUN_COMMAND":
      return <ToolCall step={step} type={type} timestamp={ts} icon="⚡" />;
    case "VIEW_FILE":
      return <ToolCall step={step} type={type} timestamp={ts} icon="📄" />;
    case "WRITE_TO_FILE":
      return <ToolCall step={step} type={type} timestamp={ts} icon="✏️" />;
    case "REPLACE_FILE_CONTENT":
      return <ToolCall step={step} type={type} timestamp={ts} icon="✏️" />;
    case "FIND":
    case "GREP":
    case "LIST_DIR":
      return <ToolCall step={step} type={type} timestamp={ts} icon="🔍" />;
    case "SEARCH_WEB":
      return <ToolCall step={step} type={type} timestamp={ts} icon="🌐" />;
    case "READ_URL_CONTENT":
    case "VIEW_CONTENT_CHUNK":
      return <ToolCall step={step} type={type} timestamp={ts} icon="🔗" />;
    case "GENERATE_IMAGE":
      return <ToolCall step={step} type={type} timestamp={ts} icon="🖼️" />;
    case "BROWSER_SUBAGENT":
    case "OPEN_BROWSER_URL":
    case "READ_BROWSER_PAGE":
      return <ToolCall step={step} type={type} timestamp={ts} icon="🌍" />;
    case "COMMAND_STATUS":
      // Skip noise unless error
      if (step.commandStatus?.status === "CORTEX_STEP_STATUS_ERROR") {
        return <ToolCall step={step} type={type} timestamp={ts} icon="⚠️" />;
      }
      return null;
    default:
      return <ToolCall step={step} type={type} timestamp={ts} icon="⚙️" />;
  }
}

// ── Step Components ─────────────────────────────────────────────────────────

function UserMessage({ step, timestamp }: { step: TrajectoryStep; timestamp: string }) {
  const items = step.userInput?.items ?? [];
  const text = items.map((i) => i.text).join("\n") || step.userInput?.userResponse || "(empty)";

  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] bg-accent-blue/10 border border-accent-blue/20 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-semibold text-accent-blue">💬 User</span>
          <span className="text-[10px] text-text-muted">{timestamp}</span>
        </div>
        <div className="text-[13px] text-text-primary whitespace-pre-wrap wrap-break-word">
          {text}
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ step, timestamp }: { step: TrajectoryStep; timestamp: string }) {
  const response = step.plannerResponse;
  let content = "(response content not parseable)";

  if (response && typeof response === "object") {
    const r = response as Record<string, unknown>;
    if (typeof r.text === "string") content = r.text;
    else if (typeof r.content === "string") content = r.content;
    else if (typeof r.message === "string") content = r.message;
    else {
      const firstString = Object.values(r).find(
        (v) => typeof v === "string" && (v as string).length > 0,
      );
      if (typeof firstString === "string") content = firstString;
    }
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] bg-bg-secondary border border-border rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-semibold text-accent-purple">🤖 Assistant</span>
          <span className="text-[10px] text-text-muted">{timestamp}</span>
        </div>
        <div className="text-[13px] text-text-primary whitespace-pre-wrap wrap-break-word leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  );
}

function TaskBoundary({ step }: { step: TrajectoryStep }) {
  const tb = step.taskBoundary;
  if (!tb) return null;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-2 text-[11px] text-text-muted">
        <span>📋</span>
        <span className="font-semibold text-accent-green">{tb.taskName}</span>
        {tb.mode && (
          <span className="bg-bg-tertiary px-1.5 py-0.5 rounded text-[10px] font-mono">
            {tb.mode}
          </span>
        )}
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function Notification({ step, timestamp }: { step: TrajectoryStep; timestamp: string }) {
  const content = step.notifyUser?.notificationContent ?? "(no content)";
  const paths = step.notifyUser?.pathsToReview;

  return (
    <div className="bg-accent-orange/5 border border-accent-orange/20 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-accent-orange">📢 Notification</span>
        <span className="text-[10px] text-text-muted">{timestamp}</span>
      </div>
      <div className="text-[13px] text-text-primary whitespace-pre-wrap">{content}</div>
      {paths && paths.length > 0 && (
        <div className="mt-2 text-[11px] text-text-muted">
          <p className="font-medium mb-1">Files for review:</p>
          {paths.map((p) => (
            <p key={p} className="font-mono truncate">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCall({
  step,
  type,
  timestamp,
  icon,
}: {
  step: TrajectoryStep;
  type: string;
  timestamp: string;
  icon: string;
}) {
  const [open, setOpen] = useState(false);
  const label = getToolLabel(step, type);

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-[12px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer bg-transparent border-none font-sans py-1 w-full text-left"
      >
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        <span>{icon}</span>
        <span className="font-mono">{type}</span>
        {label && <span className="truncate max-w-[400px] text-text-muted/70">{label}</span>}
        <span className="text-[10px] ml-auto shrink-0">{timestamp}</span>
      </button>
      {open && (
        <div className="ml-7 mt-1 mb-2 bg-bg-secondary border border-border rounded-md p-3 text-[12px] font-mono text-text-secondary whitespace-pre-wrap overflow-x-auto animate-[fadeIn_0.15s_ease]">
          {renderToolDetails(step, type)}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getToolLabel(step: TrajectoryStep, type: string): string {
  if (type === "RUN_COMMAND") return step.runCommand?.commandLine ?? "";
  if (type === "VIEW_FILE") return getPath(step.viewFile);
  if (type === "WRITE_TO_FILE") return getPath(step.writeToFile);
  if (type === "REPLACE_FILE_CONTENT") return getPath(step.replaceFileContent);
  if (type === "GREP") return getQuery(step.grep);
  if (type === "FIND") return getQuery(step.find);
  if (type === "LIST_DIR") return getPath(step.listDir);
  if (type === "SEARCH_WEB") return getQuery(step.searchWeb);
  if (type === "READ_URL_CONTENT") return getUrl(step.readUrlContent);
  if (type === "GENERATE_IMAGE") return getPrompt(step.generateImage);
  return "";
}

function renderToolDetails(step: TrajectoryStep, type: string): string {
  if (type === "RUN_COMMAND" && step.runCommand) {
    const cmd = step.runCommand;
    let details = `$ ${cmd.commandLine}`;
    if (cmd.cwd) details += `\ncwd: ${cmd.cwd}`;
    if (cmd.exitCode !== undefined) details += `\nexit: ${cmd.exitCode}`;
    if (cmd.combinedOutput?.full) {
      const output = cmd.combinedOutput.full.slice(0, 3000);
      details += `\n\n${output}`;
      if (cmd.combinedOutput.full.length > 3000) details += "\n… (truncated)";
    }
    return details;
  }

  if (type === "COMMAND_STATUS" && step.commandStatus) {
    return step.commandStatus.combined ?? `Status: ${step.commandStatus.status}`;
  }

  // For other types, show raw JSON of relevant field
  const dataKey = type.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const data = (step as unknown as Record<string, unknown>)[dataKey];
  if (data && typeof data === "object") {
    try {
      return JSON.stringify(data, null, 2).slice(0, 5000);
    } catch {
      return "(unable to display)";
    }
  }
  return "(no details)";
}

function getPath(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const r = data as Record<string, unknown>;
  if (typeof r.path === "string") return r.path;
  if (typeof r.absolutePath === "string") return r.absolutePath;
  if (typeof r.targetFile === "string") return r.targetFile;
  return "";
}

function getQuery(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const r = data as Record<string, unknown>;
  if (typeof r.query === "string") return r.query;
  if (typeof r.pattern === "string") return r.pattern;
  return "";
}

function getUrl(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const r = data as Record<string, unknown>;
  return typeof r.url === "string" ? r.url : "";
}

function getPrompt(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const r = data as Record<string, unknown>;
  return typeof r.prompt === "string" ? r.prompt.slice(0, 80) : "";
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}
