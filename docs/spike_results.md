# Phase 1.0 Spike Results — SDK + GetConversation Validation

**Date:** 2026-03-16  
**Status:** ✅ Complete  
**Verdict:** `GetConversation` RPC **does NOT exist** in the LS. Full message content is **NOT accessible** via the SDK's LS bridge.

## Environment

- Antigravity IDE (macOS)
- `antigravity-sdk` v1.6.0
- Extension installed via VSIX

## Connection Discovery

The SDK's auto-discovery has a **macOS bug**: Phase 2 port discovery uses `ss`/`netstat -tlnp` (both Linux-only). On macOS, it falls back to `extension_server_port` which is the IPC port, not ConnectRPC.

**Workaround:** Manual discovery using `lsof -iTCP -sTCP:LISTEN -p <PID>` + `sdk.ls.setConnection(port, csrfToken, true)`.

| Component | Value |
|-----------|-------|
| LS PID | discovered via `ps -eo pid,args` |
| CSRF token | extracted from `--csrf_token` CLI arg |
| ConnectRPC port | first `lsof` port excluding `extension_server_port` |
| Protocol | HTTPS (self-signed cert) |

## RPC Methods Tested

| Method | Status | Notes |
|--------|--------|-------|
| `GetAllCascadeTrajectories` (listCascades) | ✅ 200 | Returns dict of all conversations with metadata |
| `GetUserTrajectoryDescriptions` | ✅ 200 | Returns trajectory IDs + workspace scopes |
| `GetUserStatus` | ✅ 200 | Used for connection validation |
| `GetConversation` | ❌ 404 | **Does not exist** in LS |

## What `listCascades()` Returns

A dictionary keyed by `cascadeId` with rich metadata per conversation:

```
{
  [cascadeId]: {
    summary: string,           // conversation title
    stepCount: number,         // total steps
    lastModifiedTime: string,  // ISO timestamp
    trajectoryId: string,      // separate UUID
    status: string,            // e.g. CASCADE_RUN_STATUS_IDLE
    createdTime: string,
    workspaces: [{ workspaceFolderAbsoluteUri, repository, branchName }],
    lastUserInputTime: string,
    lastUserInputStepIndex: number,
    latestNotifyUserStep: {    // INCLUDES full notify_user content
      step: { notifyUser: { notificationContent: "full text..." } },
      stepIndex: number,
    },
    latestTaskBoundaryStep: {  // INCLUDES task boundary info
      step: { taskBoundary: { taskName, taskStatus, taskSummary } },
      stepIndex: number,
    },
    trajectoryMetadata: { workspaces, createdAt },
  }
}
```

> **Key insight:** `latestNotifyUserStep.step.notifyUser.notificationContent` contains the **full text** of the last `notify_user` message. This is actual conversation content, but only the *last* notify step.

## Confirmed Limitation: SDK Issue #3

[GitHub Issue #3: "Feature Request: Response content access + completion detection APIs"](https://github.com/Kanezal/antigravity-sdk/issues/3) confirms this is a **known gap**:

- The SDK cannot access response content (message text, tool call results)
- The LazyGravity project uses **CDP (Chrome DevTools Protocol)** to scrape response content from the DOM
- The SDK author acknowledges this limitation — it's an open feature request
- Proposed but unimplemented APIs: `onResponseContent()` event, `getStepContent()` RPC

## Available Data Without Full Conversation Content

From `listCascades()` alone, we can extract:
- ✅ Conversation title (summary)
- ✅ Step count
- ✅ Creation and modification timestamps
- ✅ Workspace associations
- ✅ Last user input timestamp and step index
- ✅ Latest `notify_user` message content (last one only)
- ✅ Latest `task_boundary` info (task name, status, summary)
- ❌ Full message history
- ❌ Tool call inputs/outputs
- ❌ User prompts
- ❌ Assistant responses

## Research: Alternative Data Sources

### Option 1: USS `trajectorySummaries` — ❌ Index Only

Queried `state.vscdb` in Antigravity's `globalStorage/` directory:

| USS Key | Size | Content |
|---------|------|---------|
| `trajectorySummaries` | 60 KB | Conversation index (titles, workspace URIs, last notify step) |
| `artifactReview` | 24 KB | Artifact review state |
| `userStatus` | 5 KB | User tier/models |
| `sidebarWorkspaces` | 4 KB | Recent workspaces |

**Verdict:** `trajectorySummaries` contains only index/summary data (conversation titles, workspace associations, last `notifyUser` content). **No full message history.**

### Option 2: Local `.pb` Files — ❌ None Exist

Searched Antigravity's application data directory tree:

- **No `.pb` files** found anywhere
- **No conversation JSON** in any subdirectory
- `shared_proto_db/` LevelDB = minimal (Chromium internals, not conversation data)
- `Session Storage/` = no conversation references
- `~/.gemini/antigravity/brain/<id>/` = only agent-created artifacts (plans, walkthroughs, media), NOT full message history. The `.system_generated/logs/` directory only appears during checkpoint truncation.

**Verdict:** Full conversation content is stored **server-side** (Google's cloud) and streamed by the Language Server on-demand. There is **no local cache** of complete messages.

## 🎯 BREAKTHROUGH: Undocumented RPC Methods

Methods discovered by running `strings` on the LS binary (`language_server_macos_arm`) and probing via `rawRPC()`.

### Working Methods (all take `cascadeId`)

| Method | Size | Content |
|--------|------|---------|
| `GetCascadeTrajectory` | **6.4 MB** | Full trajectory: `trajectoryId`, `trajectoryType`, all `steps[]` with types, metadata, content |
| `GetCascadeTrajectorySteps` | **3.2 MB** | Steps array only (subset of above) |
| `GetCascadeTrajectoryGeneratorMetadata` | **2.5 MB** | Per-step model info: tokens, model name, cache, response times |
| `GetArtifactSnapshots` | **14 KB** | Artifact names, URIs, and **full text content** |

### What `GetCascadeTrajectory` Returns (per step)

Each step in the `steps[]` array contains:

```
{
  type: "CORTEX_STEP_TYPE_USER_INPUT" | "CORTEX_STEP_TYPE_PLANNER_RESPONSE" | "CORTEX_STEP_TYPE_RUN_COMMAND" | ...,
  status: "CORTEX_STEP_STATUS_DONE" | ...,
  metadata: { createdAt, completedAt, source, executionId, ... },
  // Content varies by type:
  userInput: { items: [{ text }], userResponse, activeUserState },
  plannerResponse: { ... },
  runCommand: { commandLine, cwd, exitCode, combinedOutput },
  writeToFile: { ... },
  viewFile: { ... },
  notifyUser: { notificationContent, isBlocking },
  taskBoundary: { taskName, taskStatus, taskSummary },
  // ... all tool call types
}
```

**This is the FULL conversation content** — every user message, every assistant response, every tool call with inputs and outputs.

### Other Methods Tested

| Method | Status | Notes |
|--------|--------|-------|
| `GetUserTrajectoryDebug` | ✅ 97 KB | `mainline[]` with user-executed commands (IDE terminal) |
| `LoadTrajectory` | ✅ `{}` | Accepted but empty (likely triggers panel load) |
| `CreateTrajectoryShare` | ✅ `{}` | Accepted but empty |
| `GetTranscription` | ✅ `{}` | Accepted but empty |
| `GetConversation` | ❌ 404 | Not implemented |
| `LoadReplayConversation` | ❌ 501 | Unimplemented |
| `GetModelResponse` | ❌ 500 | Entity not found |
| *`trajectoryId`-based calls* | ❌ 404/500 | Only `cascadeId` works consistently |

### Confirmed Limitation: No Rename / UpdateSummary RPC

After extensive probing and reverse-engineering of the LS binary (`language_server_macos_arm`):

- **No RPC endpoint exists** to modify the conversation summary (title) from the client.
- `UpdateSummaryForID` is an internal Go method on the `cortex.CascadeManager` struct and is **not exposed** via ConnectRPC.
- `UpdateConversationAnnotations` handles `.pbtxt` annotation files, not `state.vscdb` summaries.
- The `CHAT_TITLE` integration point in the SDK is for UI composition, not data mutation.

**Conclusion:** The only way to rename an Antigravity conversation is by directly mutating the protobuf structures in the local SQLite database (`state.vscdb`), which requires restarting the Language Server to take effect.

## Final Verdict

**Full conversation backup is 100% viable** using:

1. `listCascades()` → enumerate all conversations with metadata
2. `GetCascadeTrajectory` → download full conversation content per cascade
3. `GetArtifactSnapshots` → download artifact text content
4. `GetCascadeTrajectoryGeneratorMetadata` → (optional) download model/token metadata

All methods are local-only (127.0.0.1), use session CSRF tokens, and follow the same protocol Antigravity itself uses.
