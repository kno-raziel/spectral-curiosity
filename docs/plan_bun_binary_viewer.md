# Plan: Phase 2 — Standalone Binary + Backup Viewer

## Goal

Add a **Backup Viewer** to Spectral that lets users browse, search, and read their backed-up conversations from Phase 1 — without Antigravity installed. Delivered in two rounds:

- **Round 1** (this plan): Backup Reader + API Routes + Viewer UI
- **Round 2** (separate plan): CLI + Binary Compilation + Distribution

## Background

Phase 1 exports conversations to a portable format (`manifest.json`, `trajectory.json`, `messages.md`, per-conversation metadata). The viewer reads this on-disk format and renders it in the existing React SPA.

> [!IMPORTANT]
> This plan reads the backup format defined in [Phase 1.2](./plan_extension_sdk_backup.md). Types come from `shared/backup-format.ts`.

---

## Decisions (Confirmed)

1. **Route rename:** existing `/api/backups` → `/api/snapshots` (cleaner namespace)
2. **CLI parser:** zero-dep `Bun.argv` (deferred to Round 2)
3. **Scope:** UI-first — build the viewer before packaging the binary

---

## Proposed Changes

### Route Rename (prerequisite)

Rename existing snapshot routes to free `/api/backups` for the viewer.

#### [MODIFY] [index.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/server/index.ts)

- `/api/backups` → `/api/snapshots`
- `/api/backups/diff` → `/api/snapshots/diff`

#### [MODIFY] [api.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/client/api.ts)

- `fetchBackups()` → `fetchSnapshots()` — update URL to `/api/snapshots`
- `fetchDiff()` → update URL to `/api/snapshots/diff`

#### [MODIFY] [BackupPanel/](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/client/components/BackupPanel)

- Update imports to use the renamed functions

---

### Shared Trajectory Types

The viewer UI needs to render trajectory steps on the client side. The step types currently live in `extension/sdk/ls-types.ts` (which is excluded from the main `tsconfig.json`). We'll extract the renderable types into `shared/`.

#### [NEW] [trajectory-types.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/shared/trajectory-types.ts)

Extract from `extension/sdk/ls-types.ts` into shared:

- `StepType` — the discriminated union (`CORTEX_STEP_TYPE_USER_INPUT`, etc.)
- `StepStatus` — done/running/error
- `StepMetadata` — timestamps, source
- `TrajectoryStep` — the big union with `userInput?`, `plannerResponse?`, `runCommand?`, etc.
- `FullTrajectory` — wraps the array of steps + metadata

These types are **read-only** for the viewer (no write operations). The extension continues importing from its own `ls-types.ts` to avoid coupling.

---

### Backup Reader (Shared Module)

#### [NEW] [backup-reader.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/shared/backup-reader.ts)

Platform-agnostic reader for Phase 1 backup directories:

```typescript
class BackupReader {
  constructor(backupRootDir: string);

  /** List all backup directories (sorted newest first) */
  listBackups(): Promise<BackupSummary[]>;

  /** Manifest for a specific backup */
  getManifest(backupId: string): Promise<BackupManifest>;

  /** All conversations in a backup */
  listConversations(backupId: string): Promise<ConversationBackupMeta[]>;

  /** Full trajectory (steps array) for a conversation */
  getTrajectory(backupId: string, convId: string): Promise<FullTrajectory>;

  /** Artifact snapshots */
  getArtifacts(backupId: string, convId: string): Promise<ArtifactSnapshot[]>;

  /** Human-readable markdown export */
  getMarkdown(backupId: string, convId: string): Promise<string>;

  /** Full-text search across messages.md files */
  search(backupId: string, query: string): Promise<SearchResult[]>;
}
```

- `backupId` = directory name (e.g. `spectral-backup-2026-03-16T19-45-00`)
- Lazy: reads files on demand, no upfront load
- Search scans `messages.md` (smaller than `trajectory.json`)

#### [NEW] [backup-reader-types.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/shared/backup-reader-types.ts)

```typescript
interface BackupSummary {
  id: string;              // directory name
  path: string;
  createdAt: string;
  conversationCount: number;
  totalSizeBytes: number;
  strategy: BackupStrategy;
}

interface SearchResult {
  conversationId: string;
  title: string;
  matches: Array<{ line: number; content: string }>;
}
```

---

### Backup Viewer API Routes

#### [NEW] [backup-viewer.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/server/routes/backup-viewer.ts)

| Method | Route | Returns |
|--------|-------|---------|
| `GET` | `/api/backups` | List backup directories |
| `GET` | `/api/backups/:id` | Manifest |
| `GET` | `/api/backups/:id/conversations` | Conversation list |
| `GET` | `/api/backups/:id/conversations/:convId` | Full trajectory |
| `GET` | `/api/backups/:id/conversations/:convId/markdown` | Markdown export |
| `GET` | `/api/backups/:id/search?q=term` | Search results |

Exports a `handleBackupRoute(req, reader): Response | null` since Bun.serve uses static route keys.

#### [MODIFY] [index.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/server/index.ts)

- Instantiate `BackupReader` with configurable path (env var `SPECTRAL_BACKUP_DIR` or default `~/antigravity-backups`)
- Add fallback handler before `/*` catch-all that delegates to `handleBackupRoute`

---

### Backup Viewer UI

New React components for browsing backed-up conversations.

#### [NEW] `src/client/components/BackupViewer/`

| File | Purpose |
|------|---------|
| `BackupViewer.tsx` | Root component — tab-based navigation between backup list and detail |
| `BackupList.tsx` | Cards showing each backup with date, count, size |
| `ConversationList.tsx` | Searchable/filterable list within a backup |
| `ConversationDetail.tsx` | Full conversation renderer — dispatches to step components |
| `steps/UserMessage.tsx` | `💬 User` — renders user input |
| `steps/AssistantMessage.tsx` | `🤖 Assistant` — renders planner response with markdown |
| `steps/ToolCall.tsx` | Generic tool step (command, view file, write, search) — collapsible |
| `steps/TaskBoundary.tsx` | `📋 Task` — section header |
| `steps/Notification.tsx` | `📢 Notification` — with files for review |
| `SearchResults.tsx` | Full-text search results with snippets |
| `index.ts` | Barrel export |

Design approach:
- **Chat-like layout**: user messages on right, assistant on left
- **Collapsible tool calls**: tool steps (view_file, run_command, grep, etc.) are collapsed by default — click to expand details
- **Code blocks**: syntax-highlighted with Bun's built-in CSS (no extra dependency)
- **Step type discriminator**: mirrors the `switch` in `markdown-export.ts` but renders React components
- **Dark theme**: matches existing Spectral UI

#### [NEW] [useBackups.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/client/hooks/useBackups.ts)

React hooks for backup data:

```typescript
function useBackupList(): { backups, loading, error };
function useConversationList(backupId): { conversations, loading, error };
function useConversation(backupId, convId): { trajectory, loading, error };
function useBackupSearch(backupId, query): { results, loading };
```

#### [MODIFY] [api.ts](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/client/api.ts)

Add backup viewer fetch functions:
- `fetchBackupList()` — `GET /api/backups`
- `fetchBackupConversations(id)` — `GET /api/backups/:id/conversations`
- `fetchBackupConversation(id, convId)` — `GET /api/backups/:id/conversations/:convId`
- `fetchBackupSearch(id, query)` — `GET /api/backups/:id/search?q=`

#### [MODIFY] [App.tsx](file:///Users/kno-raziel/Documents/Dev/node/spectral-curiosity/src/client/App.tsx)

- Add a tab/view toggle between "Workspace Manager" (current) and "Backup Viewer" (new)
- Conditionally render `BackupViewer` or existing content based on active tab

---

## Verification Plan

### Automated — Typecheck + Lint

```bash
bun run check
```

Zero errors after all changes.

### Manual — Route Rename

1. Run `bun run dev`
2. Verify old URL is gone: `curl http://localhost:3000/api/backups` → should NOT return snapshot list
3. Verify renamed URL works: `curl http://localhost:3000/api/snapshots` → returns snapshot list
4. Open browser → existing BackupPanel/DiffControls still work with the renamed endpoints

### Manual — Backup Viewer API

> Requires at least one backup from Phase 1 ("Spectral: Backup Now" in extension).

```bash
# Set backup directory
export SPECTRAL_BACKUP_DIR=~/antigravity-backups

bun run dev

# In another terminal:
curl http://localhost:3000/api/backups
# → JSON array of backup summaries

curl http://localhost:3000/api/backups/{id}/conversations
# → JSON array of conversation metadata

curl http://localhost:3000/api/backups/{id}/conversations/{convId}
# → Full trajectory JSON

curl http://localhost:3000/api/backups/{id}/search?q=typescript
# → Search results with line numbers
```

### Manual — Backup Viewer UI

1. Open `http://localhost:3000` in browser
2. Verify a "Backup Viewer" tab/link is visible in the header
3. Click "Backup Viewer" → backup list loads with cards (date, count, size)
4. Click a backup → conversation list with titles and dates
5. Click a conversation → messages render:
   - User messages styled distinctly from assistant responses
   - Tool calls (run_command, view_file, etc.) are collapsible
   - Code blocks are legible
6. Use the search bar → results show matching conversations with snippets
7. Navigate back → state is preserved
