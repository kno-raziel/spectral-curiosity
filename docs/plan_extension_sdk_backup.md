# Plan: Extension SDK Integration + Automated Backup

## Goal

Integrate the [antigravity-sdk](https://github.com/Kanezal/antigravity-sdk) into Spectral Curiosity's Antigravity extension to enable automated conversation backup with full content extraction via the Language Server's ConnectRPC protocol.

## Background

Antigravity stores conversations as AES-GCM encrypted `.pb` files in `~/.gemini/antigravity/conversations/`. These files cannot be decoded externally. However, the community `antigravity-sdk` provides access to a local Language Server with 68 verified RPC methods, including `GetConversation` which likely returns full conversation content.

The SDK communicates via three local channels:
1. `vscode.commands.executeCommand()` — standard VS Code Extension API
2. Read-only `state.vscdb` — SQLite via `sql.js` (WASM)
3. ConnectRPC to `127.0.0.1` Language Server — ephemeral CSRF token auth

> [!IMPORTANT]
> This plan depends on a **spike** to validate that `GetConversation` returns actual message content. If it doesn't, Phase 1.3 will need to be redesigned around raw file backup + brain log extraction.

---

## Phases

### Phase 1.0 — Spike: Validate `GetConversation` Response

**Goal:** Determine the exact response structure of the LS `GetConversation` RPC.

#### Tasks

- [ ] Install `antigravity-sdk` as a dev dependency in `src/extension/`
- [ ] Create a minimal test command in the extension that:
  1. Initializes the SDK (`AntigravitySDK` + `LSBridge`)
  2. Calls `sdk.ls.listCascades()` → logs response shape
  3. Picks a conversation ID and calls `sdk.ls.getConversation(id)` → logs full response
  4. Calls `sdk.ls.getTrajectoryDescriptions()` → logs response shape
- [ ] Document the response schemas (what fields exist, is message content included?)
- [ ] If `GetConversation` doesn't include messages, test `rawRPC` with other potential methods (e.g. `GetCascadeTrajectory`, `GetConversationMessages`)

#### Deliverable

A documented JSON schema of what each LS method returns, confirming whether full message content is accessible.

#### Files Modified

- `src/extension/package.json` — add `antigravity-sdk` dependency
- `src/extension/extension.ts` — add a temporary spike command

---

### Phase 1.1 — SDK Integration Layer

**Goal:** Integrate the SDK cleanly into the extension architecture.

#### Tasks

- [ ] Create `src/extension/sdk/` module with initialization logic
- [ ] Create `SdkManager` class that wraps SDK lifecycle (init, dispose)
- [ ] Handle SDK initialization failures gracefully (e.g. LS not found)
- [ ] Register SDK-dependent features only when SDK is available
- [ ] Add SDK status to the extension's status bar item

#### Files

- `src/extension/sdk/index.ts` — barrel export
- `src/extension/sdk/sdk-manager.ts` — SDK lifecycle management
- `src/extension/extension.ts` — wire SdkManager into activation

#### Design Notes

The SDK should be an **optional enhancement** — if the LS is unavailable (e.g. older Antigravity version), the extension should still function with existing features (workspace management via `state.vscdb`).

---

### Phase 1.2 — Backup Format Definition

**Goal:** Define the portable backup format that Phase 2 (Bun Viewer) will consume.

#### Backup Structure

```
spectral-backup-2026-03-16T19-45-00/
├── manifest.json                          # Backup metadata
├── conversations/
│   ├── {uuid}/
│   │   ├── metadata.json                  # Title, timestamps, step count, workspace
│   │   ├── messages.json                  # Full message history (from LS)
│   │   ├── messages.md                    # Human-readable Markdown export
│   │   └── raw.pb                         # Copy of original .pb file (optional)
│   └── ...
├── brain/
│   ├── {uuid}/
│   │   ├── .system_generated/logs/        # Mirrored from source
│   │   └── *.md                           # Artifacts
│   └── ...
├── knowledge/                             # Full KI mirror
│   └── {ki-name}/
│       ├── metadata.json
│       └── artifacts/
├── skills/                                # Global skills
├── workflows/                             # Global workflows
└── settings/
    └── user_settings.pb                   # User preferences
```

#### `manifest.json` Schema

```json
{
  "version": "1.0.0",
  "createdAt": "2026-03-16T19:45:00Z",
  "tool": "spectral-curiosity",
  "toolVersion": "0.2.0",
  "conversationCount": 81,
  "totalSizeBytes": 524288000,
  "strategy": "full",
  "sourcePaths": {
    "conversations": "~/.gemini/antigravity/conversations",
    "brain": "~/.gemini/antigravity/brain",
    "knowledge": "~/.gemini/antigravity/knowledge"
  }
}
```

#### Files

- `src/shared/backup-format.ts` — TypeScript types for the backup structure
- `src/shared/backup-writer.ts` — Platform-agnostic backup writer (used by extension)
- `src/shared/backup-reader.ts` — Platform-agnostic backup reader (used by Bun viewer)

---

### Phase 1.3 — Backup Engine (Extension)

**Goal:** Implement the backup engine that runs inside the extension.

#### Tasks

- [ ] Create `BackupEngine` class in `src/extension/sdk/`
- [ ] Implement conversation export:
  1. `sdk.ls.listCascades()` → get all conversation IDs
  2. For each: `sdk.ls.getConversation(id)` → extract content
  3. Serialize to JSON + Markdown using backup-writer
- [ ] Implement file-system backup:
  1. Copy `brain/` directory tree
  2. Copy `knowledge/` directory tree
  3. Copy `skills/`, `workflows/`, `user_settings.pb`
- [ ] Implement backup rotation (keep last N backups, configurable)
- [ ] Progress reporting via VS Code progress notification

#### Files

- `src/extension/sdk/backup-engine.ts` — Core backup logic
- `src/extension/sdk/backup-scheduler.ts` — Scheduling and event triggers

---

### Phase 1.4 — Automated Backup Scheduling

**Goal:** Event-driven + interval backup with user-configurable settings.

#### SDK Event Triggers

```typescript
// After conversation switch — backup the one you just left
sdk.monitor.onActiveSessionChanged((e) => { scheduleBackup(e.previousId); });

// After significant progress
sdk.monitor.onStepCountChanged((e) => {
  if (e.delta >= settings.stepThreshold) scheduleBackup(e.id);
});

// Periodic full backup
setInterval(() => fullBackup(), settings.intervalMs);
```

#### Extension Settings (`package.json` contributes)

```json
{
  "spectralCuriosity.backup.enabled": { "type": "boolean", "default": false },
  "spectralCuriosity.backup.path": { "type": "string", "default": "~/antigravity-backups" },
  "spectralCuriosity.backup.strategy": {
    "type": "string",
    "enum": ["interval", "event", "hybrid"],
    "default": "hybrid"
  },
  "spectralCuriosity.backup.intervalMinutes": { "type": "number", "default": 60 },
  "spectralCuriosity.backup.stepThreshold": { "type": "number", "default": 50 },
  "spectralCuriosity.backup.maxBackups": { "type": "number", "default": 10 },
  "spectralCuriosity.backup.includeKnowledge": { "type": "boolean", "default": true },
  "spectralCuriosity.backup.includeBrain": { "type": "boolean", "default": true },
  "spectralCuriosity.backup.includeSkills": { "type": "boolean", "default": true },
  "spectralCuriosity.backup.includeRawPb": { "type": "boolean", "default": false }
}
```

#### Tasks

- [ ] Add settings contributions to `src/extension/package.json`
- [ ] Implement `BackupScheduler` with event + interval support
- [ ] Add "Spectral Curiosity: Backup Now" command
- [ ] Add "Spectral Curiosity: Open Backup Folder" command
- [ ] Status bar indicator showing last backup time
- [ ] Debounce rapid events (avoid backing up the same conversation twice in 30s)

#### Files

- `src/extension/sdk/backup-scheduler.ts` — Scheduling logic
- `src/extension/package.json` — Settings + commands
- `src/extension/commands.ts` — Manual backup commands

---

### Phase 1.5 — Manual Export UI

**Goal:** Add a webview panel option for one-click full export.

#### Tasks

- [ ] Add "Export All" button in the Spectral Curiosity webview
- [ ] Show progress bar with conversation count
- [ ] Allow selecting what to include (conversations, KIs, skills)
- [ ] Allow choosing destination folder via VS Code folder picker

---

## Verification Plan

### Phase 1.0 (Spike)

1. Build extension: `bun run build:ext`
2. Install in Antigravity: `antigravity --install-extension *.vsix`
3. Run command `Spectral Curiosity: SDK Spike` from Command Palette
4. Check Output panel → "Spectral Curiosity" channel for response logs
5. Validate: does the logged JSON contain message text content?

### Phases 1.1–1.5

1. **Automated check:** `bun run check` (typecheck + lint pass)
2. **Manual test — SDK init:**
   - Open Antigravity with Spectral Curiosity extension
   - Check status bar shows SDK status (connected / disconnected)
   - Check Output panel for "SdkManager initialized" log
3. **Manual test — Backup Now:**
   - Run `Spectral Curiosity: Backup Now` from Command Palette
   - Verify backup directory is created at configured path
   - Verify `manifest.json` exists and has correct metadata
   - Verify at least one `conversations/{uuid}/messages.json` exists
   - Verify `brain/` and `knowledge/` directories are mirrored
4. **Manual test — Automated backup:**
   - Enable `spectralCuriosity.backup.enabled` in Settings
   - Set interval to 1 minute for testing
   - Wait and verify a backup is created automatically
   - Switch conversations and verify event-driven backup fires
5. **Manual test — Rotation:**
   - Set `maxBackups` to 3
   - Trigger 5 backups
   - Verify only 3 most recent backup directories remain
