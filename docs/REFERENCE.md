# Spectral — Technical Reference

> Consolidated from 7 separate docs. Single source of truth for architecture, findings, and roadmap.

---

## 1. What Spectral Does

Spectral is a backup & management tool for [Antigravity](https://antigravity.dev) conversations. It runs as:

- **Bun standalone binary** (`dist/spectral`) — workspace management + conversation viewer, no dependencies
- **VS Code / Antigravity extension** — full backup engine with LS integration via ConnectRPC

### Current Features (v0.1.0)

- Auto-detect workspaces from `state.vscdb`
- Search, filter, reassign conversations to workspaces (protobuf write)
- Handle orphaned conversations (exist on disk but missing from DB index)
- Full conversation backup via LS RPC (extension only)
- Brain / Knowledge / Skills directory backup
- DB snapshot diffing (compare current vs backup)
- Dual runtime: `bun:sqlite` (server) + `node-sqlite3-wasm` (extension)

---

## 2. Antigravity Data Model

### Where Conversations Live

| Source | Path | Contains |
|--------|------|----------|
| `.pb` files | `~/.gemini/antigravity/conversations/*.pb` | Full conversation content |
| `trajectorySummaries` | `state.vscdb` → `ItemTable` | Index: titles, workspaces, timestamps |
| `sidebarWorkspaces` | `state.vscdb` → `ItemTable` | Workspace list for sidebar |
| LS RPC (cloud) | Language Server → Google Cloud | Full message history (streamed on demand) |
| `brain/` | `~/.gemini/antigravity/brain/{cid}/` | Agent artifacts: plans, walkthroughs, media |
| `knowledge/` | `~/.gemini/antigravity/knowledge/` | Distilled KI items |

> [!IMPORTANT]
> A conversation can exist **on disk without a DB index entry** (orphaned). Spectral handles this by creating fresh DB entries on save. Full message content lives server-side — local `.pb` files are NOT message caches.

### state.vscdb Structure

SQLite database, 443 keys in `ItemTable`. 17 are base64-encoded protobuf blobs:

| Key | Size | Purpose |
|-----|------|---------|
| `trajectorySummaries` | ~55 KB | **Main index** — titles, workspaces, timestamps, history |
| `artifactReview` | ~39 KB | Artifact review comments per conversation |
| `theme` | ~14 KB | Full color theme (JSON inside protobuf wrapper) |
| `userStatus` | ~4 KB | User profile, email, model tiers |
| `sidebarWorkspaces` | ~4 KB | Workspace list (22 entries) |
| `oauthToken` | 548 B | Access + refresh tokens |
| `agentPreferences` | 291 B | Terminal auto-exec, artifact review policies |
| `agentManagerWindow` | 142 B | Window dimensions |
| Others | < 140 B | Browser prefs, model prefs, credits, onboarding flags |

### Protobuf Schema: `trajectorySummaries`

```protobuf
message TrajectorySummaries {
  repeated Entry entries = 1;
}

message Entry {
  string conversation_id = 1;      // UUID
  InfoWrapper info = 2;            // Contains base64 inner blob
}

// Inner blob (decoded from InfoWrapper.info_b64):
message InnerInfo {
  string title = 1;
  int32  message_count = 2;
  Timestamp created = 3;           // { seconds, nanos }
  string conversation_uuid = 4;    // Duplicate UUID
  int32  unknown_5 = 5;
  Timestamp modified = 7;
  WorkspaceAssociation workspace = 9;
  Timestamp accessed = 10;
  ConversationHistory history = 12; // Large opaque blob
  bytes  unknown_14 = 14;
  PinnedInfo pinned = 15;
  int32  unknown_16 = 16;
  LastSession last_session = 17;
}

message WorkspaceAssociation {
  string uri = 1;                   // file:///path/to/workspace
  string uri_dup = 2;              // Always same as uri
  GitInfo git = 3;                  // { slug, remote }
  string branch = 4;               // "main"
}
```

### Preference Keys (Sentinel Pattern)

Most config keys use a sentinel-key/value pattern where the value is a base64-encoded small protobuf:

| Sentinel Key | Decoded Type |
|---|---|
| `terminalAutoExecutionPolicySentinelKey` | Varint (enum) |
| `artifactReviewPolicySentinelKey` | Varint (enum) |
| `demoModeEnabledSentinelKey` | Boolean |
| `secureModeEnabledSentinelKey` | Boolean |
| `availableCreditsSentinelKey` | Float |
| `last_selected_agent_model_sentinel_key` | Varint |
| `managerWidth` / `managerHeight` / `managerX` / `managerY` | Float |

---

## 3. Language Server RPC (Extension Only)

### Connection Discovery (macOS)

SDK's built-in discovery uses Linux-only `ss`/`netstat`. macOS workaround:

```
PID        → ps -eo pid,args | grep language_server
CSRF token → extract from --csrf_token CLI arg
Port       → lsof -iTCP -sTCP:LISTEN -p <PID> (exclude extension_server_port)
Protocol   → HTTPS (self-signed cert)
```

Implementation: `src/extension/sdk/connection.ts`

### Available RPC Methods

| Method | Key | Returns | Size |
|--------|-----|---------|------|
| `GetAllCascadeTrajectories` | — | All conversations with metadata | ~100 KB |
| `GetCascadeTrajectory` | `cascadeId` | **Full conversation** — all steps with content | 3-6 MB |
| `GetCascadeTrajectorySteps` | `cascadeId` | Steps array only | ~3 MB |
| `GetArtifactSnapshots` | `cascadeId` | Artifact names + full text | ~14 KB |
| `GetCascadeTrajectoryGeneratorMetadata` | `cascadeId` | Token usage, model names, timing | ~2.5 MB |

> [!WARNING]
> Always use `cascadeId`, never `trajectoryId` (returns 404/500).
> No rename/update RPC exists — title changes require direct `state.vscdb` mutation + LS restart.

### Known LS Limits

| What | Limit | Workaround |
|------|-------|------------|
| `listCascades()` | 10 items | SQLite protobuf decode |
| `GetCascadeTrajectory` | ~2000 steps | Metadata-only export + brain/ fallback |
| Conversation rename | No RPC | Direct protobuf mutation in DB |

---

## 4. Backup System

### Backup Format

```
spectral-backup-{timestamp}/
├── manifest.json                    # Metadata (version, counts, paths)
├── conversations/{uuid}/
│   ├── metadata.json                # Title, timestamps, step count, workspace
│   ├── trajectory.json              # Full LS trajectory
│   ├── messages.md                  # Human-readable Markdown
│   └── artifacts.json               # From GetArtifactSnapshots
├── brain/{uuid}/                    # Agent artifacts (plans, walkthroughs)
├── knowledge/{ki-name}/             # Knowledge Items
├── skills/                          # Global skills (symlinks dereferenced)
└── workflows/                       # Global workflows
```

### Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `backup.enabled` | `false` | Enable auto-backup |
| `backup.path` | `~/antigravity-backups` | Destination directory |
| `backup.strategy` | `hybrid` | `interval`, `event`, or `hybrid` |
| `backup.intervalMinutes` | `60` | Auto-backup interval |
| `backup.maxBackups` | `10` | Rotation: keep last N |
| `backup.include{Knowledge,Brain,Skills}` | `true` | Include extra directories |

### Resilience

- **Purged conversations**: detected and logged separately
- **Large conversations (2000+ steps)**: exported as metadata-only with brain/ fallback
- **Atomic writes**: temp dir → rename on success
- **Backup rotation**: configurable, oldest deleted first

---

## 5. Save Flow (Protobuf Mutation)

```
User assigns workspace in Spectral UI
  │
  └─ saveAssignments()
       ├─ 1. Backup: cp state.vscdb → .backup_app_{ts}
       ├─ 2. Read trajectorySummaries from DB
       ├─ 3. Parse: entries + rawEntries (preserves root bytes)
       ├─ 4. Modify existing entries: strip field 9, inject new workspace
       ├─ 5. Create entries for orphaned conversations (not in DB index)
       ├─ 6. Update sidebarWorkspaces
       └─ 7. Write both blobs back to DB
```

### Known Pitfalls

1. **Orphaned conversations** — CIDs on disk but not in DB → handled with fresh entry creation
2. **Root field preservation** — All undocumented fields kept byte-for-byte during mutation
3. **LS conflict** — Close Antigravity before saving (LS overwrites DB from memory)

---

## 6. Roadmap

### Done ✅

- **Phase 1.0** — Spike: validated LS RPC methods, discovered `GetCascadeTrajectory`
- **Phase 1.1** — SDK integration layer (`src/extension/sdk/`)
- **Phase 1.3** — Backup engine with SQLite fallback, rotation, resilience
- **Phase 1.4** — Automated scheduling (interval + event-driven)
- **Orphaned conversations fix** — Fresh DB entries for conversations missing from index

### In Progress 🔧

- **Phase 2 Round 1** — Backup Viewer UI (browse, search, read exported conversations)
  - BackupReader shared module
  - API routes (`/api/backups/*`)
  - React UI with chat-like layout, collapsible tool calls, dark theme
- **Phase 1.5** — Manual export UI in webview panel

### Pending 📋

- **Phase 2 Round 2** — CLI + cross-platform binary distribution (GitHub Releases)
- Paginated step fetch (`GetCascadeTrajectorySteps` with `startIndex`/`endIndex`)
- Incremental backup (skip unchanged conversations)
- Full-text search across all backed-up conversations

### Future Ideas 💡

- Export to Obsidian vault, Notion, HTML, PDF
- Usage analytics dashboard (tokens, models, step counts)
- Integration with other AI IDEs (Cursor, Windsurf)
