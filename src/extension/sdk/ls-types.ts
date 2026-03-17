/**
 * TypeScript types for Antigravity Language Server RPC responses.
 *
 * Derived from spike output of `GetCascadeTrajectory`, `GetCascadeTrajectorySteps`,
 * `GetArtifactSnapshots`, and `GetCascadeTrajectoryGeneratorMetadata`.
 *
 * These are intentionally loose (many optional fields) since they're based on
 * observed output, not a formal proto schema. We type what we use and leave
 * the rest as `unknown`.
 */

// ── Cascade Index (from listCascades / GetAllCascadeTrajectories) ────

export interface CascadeWorkspace {
  workspaceFolderAbsoluteUri: string;
  repository?: string;
  branchName?: string;
}

export interface CascadeNotifyUserStep {
  step: {
    notifyUser: {
      notificationContent: string;
      isBlocking?: boolean;
    };
  };
  stepIndex: number;
}

export interface CascadeTaskBoundaryStep {
  step: {
    taskBoundary: {
      taskName: string;
      taskStatus: string;
      taskSummary: string;
    };
  };
  stepIndex: number;
}

export interface CascadeEntry {
  summary: string;
  stepCount: number;
  lastModifiedTime: string;
  trajectoryId: string;
  status: string;
  createdTime: string;
  workspaces: CascadeWorkspace[];
  lastUserInputTime?: string;
  lastUserInputStepIndex?: number;
  latestNotifyUserStep?: CascadeNotifyUserStep;
  latestTaskBoundaryStep?: CascadeTaskBoundaryStep;
  trajectoryMetadata?: {
    workspaces: CascadeWorkspace[];
    createdAt: string;
  };
}

/** Dictionary keyed by cascadeId */
export type CascadeIndex = Record<string, CascadeEntry>;

// ── Trajectory Steps (from GetCascadeTrajectory / GetCascadeTrajectorySteps) ──

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

export interface StepMetadata {
  createdAt: string;
  completedAt?: string;
  source: string;
  executionId?: string;
  sourceTrajectoryStepInfo?: {
    trajectoryId: string;
    cascadeId: string;
  };
  internalMetadata?: unknown;
}

export interface TrajectoryStep {
  type: StepType;
  status: StepStatus;
  metadata: StepMetadata;
  // Content — only ONE of these will be present per step (depends on type)
  userInput?: {
    items: Array<{ text: string }>;
    userResponse: string;
    activeUserState?: unknown;
  };
  plannerResponse?: unknown;
  runCommand?: {
    commandLine: string;
    proposedCommandLine?: string;
    cwd: string;
    blocking?: boolean;
    exitCode?: number;
    combinedOutput?: { full: string };
    usedIdeTerminal?: boolean;
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

export interface FullTrajectory {
  trajectory: {
    trajectoryId: string;
    cascadeId: string;
    trajectoryType: string;
    /** May be absent for very large conversations where the LS omits step data */
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

export interface TrajectoryStepsResponse {
  steps: TrajectoryStep[];
}

// ── Artifact Snapshots ──

export interface ArtifactSnapshot {
  artifactName: string;
  artifactAbsoluteUri?: string;
  lastEdited?: string;
  content?: string;
}

export interface ArtifactSnapshotsResponse {
  artifactSnapshots?: ArtifactSnapshot[];
}

// ── Generator Metadata ──

export interface TokenUsage {
  model: string;
  inputTokens: string;
  outputTokens: string;
  responseOutputTokens?: string;
  cacheReadTokens?: string;
  apiProvider?: string;
  responseId?: string;
}

export interface GeneratorMetadataEntry {
  stepIndices: number[];
  chatModel: {
    model: string;
    usage: TokenUsage;
    responseModel?: string;
    timeToFirstToken?: string;
    streamingDuration?: string;
    completionConfig?: unknown;
  };
  executionId: string;
}

export interface GeneratorMetadataResponse {
  generatorMetadata: GeneratorMetadataEntry[];
}

// ── Connection Discovery ──

export interface ConnectionInfo {
  port: number;
  csrfToken: string;
}
