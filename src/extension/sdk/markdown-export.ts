/**
 * Converts a FullTrajectory into a human-readable Markdown document.
 *
 * Renders user messages, planner responses, tool calls, task boundaries,
 * and notify_user steps into a structured Markdown format suitable for
 * offline reading and archival.
 */

import type { FullTrajectory, TrajectoryStep } from "./ls-types";

/**
 * Render a full trajectory as a Markdown string.
 *
 * @param trajectory - The full trajectory from GetCascadeTrajectory
 * @param title - Conversation title for the heading
 * @returns Markdown string
 */
export function renderTrajectoryMarkdown(trajectory: FullTrajectory, title: string): string {
  const lines: string[] = [];
  const traj = trajectory.trajectory;
  const steps = traj.steps ?? [];

  lines.push(`# ${escapeMarkdownTitle(title)}`);
  lines.push("");
  lines.push(`> Exported from Spectral Curiosity — ${steps.length} steps`);
  lines.push(`> Trajectory: \`${traj.trajectoryId}\``);
  lines.push(`> Cascade: \`${traj.cascadeId}\``);
  lines.push("");

  if (steps.length === 0) {
    lines.push(
      "> ⚠️ **Steps not available** — the Language Server returned trajectory metadata only.",
    );
    lines.push(
      "> This typically happens with very large conversations. The raw trajectory.json is",
    );
    lines.push("> still saved alongside this file for reference.");
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  for (const step of steps) {
    const rendered = renderStep(step);
    if (rendered) {
      lines.push(rendered);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function renderStep(step: TrajectoryStep): string | null {
  const type = step.type.replace("CORTEX_STEP_TYPE_", "");
  const timestamp = formatTimestamp(step.metadata.createdAt);

  switch (type) {
    case "USER_INPUT":
      return renderUserInput(step, timestamp);
    case "PLANNER_RESPONSE":
      return renderPlannerResponse(step, timestamp);
    case "RUN_COMMAND":
      return renderRunCommand(step, timestamp);
    case "COMMAND_STATUS":
      return renderCommandStatus(step);
    case "VIEW_FILE":
      return renderViewFile(step, timestamp);
    case "WRITE_TO_FILE":
      return renderWriteToFile(step, timestamp);
    case "REPLACE_FILE_CONTENT":
      return renderReplaceFileContent(step, timestamp);
    case "FIND":
    case "GREP":
    case "LIST_DIR":
      return renderSearchOp(step, type, timestamp);
    case "SEARCH_WEB":
      return renderSearchWeb(step, timestamp);
    case "READ_URL_CONTENT":
    case "VIEW_CONTENT_CHUNK":
      return renderReadUrl(step, type, timestamp);
    case "NOTIFY_USER":
      return renderNotifyUser(step, timestamp);
    case "TASK_BOUNDARY":
      return renderTaskBoundary(step);
    case "GENERATE_IMAGE":
      return renderGenerateImage(step, timestamp);
    case "BROWSER_SUBAGENT":
    case "OPEN_BROWSER_URL":
    case "READ_BROWSER_PAGE":
      return renderBrowserOp(step, type, timestamp);
    default:
      return renderUnknownStep(step, type, timestamp);
  }
}

// ── Step Renderers ───────────────────────────────────────────────────────────

function renderUserInput(step: TrajectoryStep, ts: string): string {
  const items = step.userInput?.items ?? [];
  const text = items.map((i) => i.text).join("\n") || step.userInput?.userResponse || "(empty)";

  return [`## 💬 User — ${ts}`, "", ...text.split("\n").map((l) => `> ${l}`)].join("\n");
}

function renderPlannerResponse(step: TrajectoryStep, ts: string): string {
  // plannerResponse is typed as unknown; extract text if possible
  const response = step.plannerResponse;
  let content = "(response content not parseable)";

  if (response && typeof response === "object") {
    const r = response as Record<string, unknown>;
    // Common shapes: { text }, { content }, { message }
    if (typeof r.text === "string") content = r.text;
    else if (typeof r.content === "string") content = r.content;
    else if (typeof r.message === "string") content = r.message;
    else {
      // Try to find any string field
      const firstString = Object.values(r).find(
        (v) => typeof v === "string" && (v as string).length > 0,
      );
      if (typeof firstString === "string") content = firstString;
    }
  }

  return [`### 🤖 Assistant — ${ts}`, "", content].join("\n");
}

function renderRunCommand(step: TrajectoryStep, ts: string): string {
  const cmd = step.runCommand;
  if (!cmd) return `*\`RUN_COMMAND\` at ${ts}*`;

  const lines = [`#### ⚡ Command — ${ts}`, ""];
  lines.push("```bash");
  lines.push(cmd.commandLine);
  lines.push("```");

  if (cmd.cwd) lines.push(`*cwd: \`${cmd.cwd}\`*`);
  if (cmd.exitCode !== undefined) lines.push(`*exit: ${cmd.exitCode}*`);

  if (cmd.combinedOutput?.full) {
    const output = truncate(cmd.combinedOutput.full, 2000);
    lines.push("", "<details>", "<summary>Output</summary>", "");
    lines.push("```");
    lines.push(output);
    lines.push("```");
    lines.push("</details>");
  }

  return lines.join("\n");
}

function renderCommandStatus(step: TrajectoryStep): string | null {
  // Command status is usually noise — skip unless there's an error
  if (step.commandStatus?.status === "CORTEX_STEP_STATUS_ERROR") {
    return `> ⚠️ Command error: ${step.commandStatus.combined ?? "(no output)"}`;
  }
  return null;
}

function renderViewFile(step: TrajectoryStep, ts: string): string {
  const vf = step.viewFile;
  if (!vf || typeof vf !== "object") return `*\`VIEW_FILE\` at ${ts}*`;
  const r = vf as Record<string, unknown>;
  const path =
    typeof r.path === "string" ? r.path : typeof r.absolutePath === "string" ? r.absolutePath : "?";
  return `*📄 Viewed \`${path}\` — ${ts}*`;
}

function renderWriteToFile(step: TrajectoryStep, ts: string): string {
  const wf = step.writeToFile;
  if (!wf || typeof wf !== "object") return `*\`WRITE_TO_FILE\` at ${ts}*`;
  const r = wf as Record<string, unknown>;
  const path =
    typeof r.path === "string" ? r.path : typeof r.targetFile === "string" ? r.targetFile : "?";
  return `*✏️ Wrote \`${path}\` — ${ts}*`;
}

function renderReplaceFileContent(step: TrajectoryStep, ts: string): string {
  const rf = step.replaceFileContent;
  if (!rf || typeof rf !== "object") return `*\`REPLACE_FILE_CONTENT\` at ${ts}*`;
  const r = rf as Record<string, unknown>;
  const path =
    typeof r.path === "string" ? r.path : typeof r.targetFile === "string" ? r.targetFile : "?";
  return `*✏️ Edited \`${path}\` — ${ts}*`;
}

function renderSearchOp(step: TrajectoryStep, type: string, ts: string): string {
  const data = type === "FIND" ? step.find : type === "GREP" ? step.grep : step.listDir;
  if (!data || typeof data !== "object") return `*\`${type}\` at ${ts}*`;
  const r = data as Record<string, unknown>;
  const query =
    typeof r.query === "string"
      ? r.query
      : typeof r.pattern === "string"
        ? r.pattern
        : typeof r.path === "string"
          ? r.path
          : "";
  return `*🔍 ${type}: \`${query}\` — ${ts}*`;
}

function renderSearchWeb(step: TrajectoryStep, ts: string): string {
  const sw = step.searchWeb;
  if (!sw || typeof sw !== "object") return `*\`SEARCH_WEB\` at ${ts}*`;
  const r = sw as Record<string, unknown>;
  const query = typeof r.query === "string" ? r.query : "?";
  return `*🌐 Web search: "${query}" — ${ts}*`;
}

function renderReadUrl(step: TrajectoryStep, type: string, ts: string): string {
  const data = type === "READ_URL_CONTENT" ? step.readUrlContent : step.viewContentChunk;
  if (!data || typeof data !== "object") return `*\`${type}\` at ${ts}*`;
  const r = data as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url : "?";
  return `*🔗 Read URL: ${url} — ${ts}*`;
}

function renderNotifyUser(step: TrajectoryStep, ts: string): string {
  const content = step.notifyUser?.notificationContent ?? "(no content)";
  const paths = step.notifyUser?.pathsToReview;

  const lines = [`#### 📢 Notification — ${ts}`, "", content];

  if (paths && paths.length > 0) {
    lines.push("", "**Files for review:**");
    for (const p of paths) {
      lines.push(`- \`${p}\``);
    }
  }

  return lines.join("\n");
}

function renderTaskBoundary(step: TrajectoryStep): string {
  const tb = step.taskBoundary;
  if (!tb) return "";

  return [
    "---",
    "",
    `### 📋 Task: ${tb.taskName}`,
    "",
    tb.taskSummary ? `${tb.taskSummary}` : "",
    tb.taskStatus ? `*Status: ${tb.taskStatus}*` : "",
    tb.mode ? `*Mode: ${tb.mode}*` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderGenerateImage(step: TrajectoryStep, ts: string): string {
  const gi = step.generateImage;
  if (!gi || typeof gi !== "object") return `*\`GENERATE_IMAGE\` at ${ts}*`;
  const r = gi as Record<string, unknown>;
  const prompt = typeof r.prompt === "string" ? r.prompt : "?";
  return `*🖼️ Generated image: "${truncate(prompt, 100)}" — ${ts}*`;
}

function renderBrowserOp(step: TrajectoryStep, type: string, ts: string): string {
  const data =
    type === "BROWSER_SUBAGENT"
      ? step.browserSubagent
      : type === "OPEN_BROWSER_URL"
        ? (step as unknown as Record<string, unknown>).openBrowserUrl
        : (step as unknown as Record<string, unknown>).readBrowserPage;
  if (!data || typeof data !== "object") return `*\`${type}\` at ${ts}*`;
  const r = data as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url : "";
  const task = typeof r.task === "string" ? truncate(r.task, 100) : "";
  const label = url || task || type;
  return `*🌍 Browser: ${label} — ${ts}*`;
}

function renderUnknownStep(_step: TrajectoryStep, type: string, ts: string): string {
  return `*\`${type}\` step at ${ts}*`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "?";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}… (truncated)`;
}

/** Escape characters that could break Markdown heading syntax */
function escapeMarkdownTitle(text: string): string {
  return text.replace(/[#>`*_[\]]/g, "\\$&");
}
