# Plan: Extension SDK Integration + Automated Backup

## Goal

Integrate the [antigravity-sdk](https://github.com/Kanezal/antigravity-sdk) into Spectral Curiosity's Antigravity extension to enable automated conversation backup with full content extraction via the Language Server's ConnectRPC protocol.

## Background

Conversation content is stored server-side (Google's cloud) and streamed by the Language Server on demand. There are no local `.pb` files or cached messages.

The community `antigravity-sdk` provides access to the local Language Server via ConnectRPC. Phase 1.0 spike discovered that **undocumented RPC methods** return full conversation content:

| Method | Key | Returns |
|--------|-----|--------|
| `GetCascadeTrajectory` | `cascadeId` | **Full conversation** — all steps with content (3-6+ MB) |
| `GetCascadeTrajectorySteps` | `cascadeId` | Steps array only (lighter) |
| `GetArtifactSnapshots` | `cascadeId` | Artifact names + text content |
| `GetCascadeTrajectoryGeneratorMetadata` | `cascadeId` | Token usage, model names, timing |

> [!IMPORTANT]
> `trajectoryId` fails for most methods — always use `cascadeId`. See `docs/spike_results.md` for full findings.

---

## Phases

### Phase 1.0 — Spike: Validate `GetConversation` Response ✅ DONE

**Result:** `GetConversation` RPC does NOT exist (404). Discovered `GetCascadeTrajectory` via LS binary reverse-engineering — returns full conversation content. See `docs/spike_results.md`.

---

### Phase 1.1 — SDK Integration Layer ✅ DONE

**Result:** Created `src/extension/sdk/` module:
- `ls-types.ts` — TypeScript types for LS RPC responses
- `ls-client.ts` — Typed wrapper (`getTrajectory()`, `getArtifactSnapshots()`, etc.)
- `connection.ts` — macOS port discovery via lsof (SDK's built-in uses Linux-only ss/netstat)
- `sdk-manager.ts` — Lifecycle manager with graceful degradation

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
│   │   ├── trajectory.json                # Full trajectory from GetCascadeTrajectory
│   │   ├── messages.md                    # Human-readable Markdown export
│   │   ├── artifacts.json                 # From GetArtifactSnapshots
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
  "conversationCount": 42,
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

### Phase 1.3 — Backup Engine (Extension) ✅ DONE

**Result:** Created `src/extension/sdk/backup-engine.ts` with:

#### Tasks

- [x] Create `BackupEngine` class in `src/extension/sdk/`
- [x] Implement conversation export:
  1. `lsClient.listCascades()` → get all cascadeIds
  2. SQLite fallback to bypass LS 10-item limit (`node-sqlite3-wasm` + protobuf decode)
  3. For each: `lsClient.getTrajectory(cascadeId)` → full steps
  4. For each: `lsClient.getArtifactSnapshots(cascadeId)` → artifact text
  5. Serialize to JSON + Markdown
- [x] Implement file-system backup:
  1. Copy `brain/` directory tree
  2. Copy `knowledge/` directory tree
  3. Copy `skills/` with symlink dereferencing, `workflows/`
- [x] Implement backup rotation (keep last N backups, configurable)
- [x] Progress reporting via VS Code progress notification
- [x] Graceful handling of purged conversations ("deleted by Antigravity")
- [x] Resilient export for large conversations (LS omits `steps` for 2000+ step conversations)

> [!NOTE]
> **Known limitation:** 7 conversations with very large step counts (~2000+) are returned by the LS without the `steps` array. The `trajectory.json` and metadata are still saved. See `docs/backup_engine.md` for pending exploration of `GetCascadeTrajectorySteps` with pagination.

#### Files

- `src/extension/sdk/backup-engine.ts` — Core backup logic
- `src/extension/sdk/markdown-export.ts` — Trajectory → Markdown renderer
- `src/shared/backup-format.ts` — Backup manifest and metadata types
- `src/extension/sdk/ls-types.ts` — Updated `FullTrajectory` with optional `steps`

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
  "spectralCuriosity.backup.includeTokenMetadata": { "type": "boolean", "default": false }
}
```

#### Tasks

- [x] Add core settings contributions to `src/extension/package.json` (`path`, `strategy`, `maxBackups`)
- [x] Add "Spectral Curiosity: Backup Now" command (with folder picker + save-to-settings prompt)
- [ ] Add remaining settings contributions (`enabled`, `intervalMinutes`, `stepThreshold`, `include*`)
- [ ] Implement `BackupScheduler` with event + interval support
- [ ] Add "Spectral Curiosity: Open Backup Folder" command
- [ ] Status bar indicator showing last backup time
- [ ] Debounce rapid events (avoid backing up the same conversation twice in 30s)

#### Files

- `src/extension/sdk/backup-scheduler.ts` — Scheduling logic (not yet created)
- `src/extension/package.json` — Settings + commands (partially done)
- `src/extension/extension.ts` — Backup Now command (done)

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
