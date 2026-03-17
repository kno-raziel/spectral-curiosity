/**
 * Trajectory types for rendering conversation steps.
 *
 * Extracted from `extension/sdk/ls-types.ts` so the client and server
 * can consume trajectory data without depending on the extension package.
 * These are read-only types — no write operations.
 */

// ── Step Types ──────────────────────────────────────────────────────────────

export type StepType =
  | "CORTEX_STEP_TYPE_USER_INPUT"
  | "CORTEX_STEP_TYPE_PLANNER_RESPONSE"
  | "CORTEX_STEP_TYPE_RUN_COMMAND"
  | "CORTEX_STEP_TYPE_COMMAND_STATUS"
  | "CORTEX_STEP_TYPE_VIEW_FILE"
  | "CORTEX_STEP_TYPE_WRITE_TO_FILE"
  | "CORTEX_STEP_TYPE_REPLACE_FILE_CONTENT"
  | "CORTEX_STEP_TYPE_FIND"
  | "CORTEX_STEP_TYPE_GREP"
  | "CORTEX_STEP_TYPE_LIST_DIR"
  | "CORTEX_STEP_TYPE_SEARCH_WEB"
  | "CORTEX_STEP_TYPE_READ_URL_CONTENT"
  | "CORTEX_STEP_TYPE_VIEW_CONTENT_CHUNK"
  | "CORTEX_STEP_TYPE_NOTIFY_USER"
  | "CORTEX_STEP_TYPE_TASK_BOUNDARY"
  | "CORTEX_STEP_TYPE_GENERATE_IMAGE"
  | "CORTEX_STEP_TYPE_BROWSER_SUBAGENT"
  | "CORTEX_STEP_TYPE_OPEN_BROWSER_URL"
  | "CORTEX_STEP_TYPE_READ_BROWSER_PAGE"
  | (string & {}); // Allow unknown step types

export type StepStatus =
  | "CORTEX_STEP_STATUS_DONE"
  | "CORTEX_STEP_STATUS_RUNNING"
  | "CORTEX_STEP_STATUS_PENDING"
  | "CORTEX_STEP_STATUS_CANCELED"
  | "CORTEX_STEP_STATUS_ERROR"
  | (string & {});

// ── Step Metadata ───────────────────────────────────────────────────────────

export interface StepMetadata {
  createdAt: string;
  completedAt?: string;
  source: string;
  executionId?: string;
}

// ── Trajectory Step ─────────────────────────────────────────────────────────

export interface TrajectoryStep {
  type: StepType;
  status: StepStatus;
  metadata: StepMetadata;

  // Content — only ONE of these will be present per step
  userInput?: {
    items: Array<{ text: string }>;
    userResponse: string;
  };
  plannerResponse?: unknown;
  runCommand?: {
    commandLine: string;
    proposedCommandLine?: string;
    cwd: string;
    blocking?: boolean;
    exitCode?: number;
    combinedOutput?: { full: string };
  };
  commandStatus?: {
    commandId: string;
    status: StepStatus;
    combined?: string;
  };
  viewFile?: unknown;
  writeToFile?: unknown;
  replaceFileContent?: unknown;
  find?: unknown;
  grep?: unknown;
  listDir?: unknown;
  searchWeb?: unknown;
  readUrlContent?: unknown;
  viewContentChunk?: unknown;
  notifyUser?: {
    notificationContent: string;
    isBlocking?: boolean;
    pathsToReview?: string[];
  };
  taskBoundary?: {
    taskName: string;
    taskStatus: string;
    taskSummary: string;
    mode?: string;
  };
  generateImage?: unknown;
  browserSubagent?: unknown;
}

// ── Full Trajectory ─────────────────────────────────────────────────────────

export interface GeneratorMetadataEntry {
  stepIndices: number[];
  chatModel: {
    model: string;
    usage: {
      model: string;
      inputTokens: string;
      outputTokens: string;
      cacheReadTokens?: string;
      apiProvider?: string;
    };
    responseModel?: string;
    timeToFirstToken?: string;
    streamingDuration?: string;
  };
  executionId: string;
}

export interface FullTrajectory {
  trajectory: {
    trajectoryId: string;
    cascadeId: string;
    trajectoryType: string;
    /** May be absent for very large conversations */
    steps?: TrajectoryStep[];
    metadata?: {
      workspaces?: Array<{
        workspaceFolderAbsoluteUri: string;
        repository?: { computedName?: string; gitOriginUrl?: string };
        branchName?: string;
      }>;
      createdAt?: string;
    };
    generatorMetadata?: GeneratorMetadataEntry[];
    parentReferences?: Array<{
      trajectoryId: string;
      trajectoryType: string;
      stepIndex: number;
      referenceType: string;
    }>;
  };
  numTotalSteps?: number;
  status?: string;
}
