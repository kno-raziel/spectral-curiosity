# Backup Engine — Features & Architecture

## Shipped Features (v0.1.0)

### 1. Full Conversation Backup
- Command: **Spectral Curiosity: Backup Now**
- Exports: `trajectory.json` (raw) + `messages.md` (Markdown) + `artifacts.json` + `metadata.json`
- Atomic writes: temp dir → rename on success
- Configurable rotation (keeps last N backups)

### 2. SQLite Fallback — Bypasses LS 10-Item Limit
The LS `listCascades()` returns max 10 conversations. We query `state.vscdb` directly via `node-sqlite3-wasm`, decode the protobuf blob (`antigravityUnifiedStateSync.trajectorySummaries`), and merge IDs with the API response.

- Discovers **all conversations** regardless of the API's 10-item cap
- Cross-platform via `DB_PATH` (macOS / Linux / Windows)

### 3. User-Configurable Destination
- Native file dialog on first run
- Option to persist path to VS Code settings
- Settings: `spectralCuriosity.backup.path`, `.strategy`, `.maxBackups`

### 4. Purged Conversation Detection
Conversations deleted by Antigravity show:
```
⏭️ "Title" — skipped (deleted by Antigravity, no data available)
```
Counted separately from actual errors.

### 5. Large Conversation Resilience
Conversations with 2000+ steps may be returned by the LS without `steps`. These are:
- Differentiated in the log with ⚠️ instead of ✅: `⚠️ "Title" — metadata only, messages pending recovery`
- Counted separately in the summary: `7 metadata only (full messages pending recovery)`
- Still exported with `trajectory.json` (metadata, generatorMetadata, parentReferences) and `messages.md` (with "Steps not available" banner)
- The `brain/` directory for these conversations contains the plans, walkthroughs, and screenshots

### 6. Brain / Knowledge / Skills Backup
- `brain/` — plans, walkthroughs, screenshots per conversation
- `knowledge/` — distilled knowledge items
- `skills/` — follows symlinks (`dereference: true`) to copy real content

---

## Technical Findings

### LS Limits
| What | Limit | Workaround |
|---|---|---|
| `listCascades()` | 10 items | SQLite protobuf decode |
| `GetCascadeTrajectory` | ~2000 steps | Metadata-only export + brain/ fallback |
| `getDiagnostics()` | 10 `recentTrajectories` | Not used, SQLite is better |

### Steps Omission Pattern
- Conversations with `numTotalSteps` > ~2000 return no `steps` array
- `generatorMetadata` IS returned (model/token data per turn)
- `parentReferences` IS returned (fork history)
- Exception: one 184-step conversation also had no steps (possibly heavy media content)

### State Database
- Path: platform-specific Antigravity `globalStorage/state.vscdb` (resolved by `shared/paths.ts`)
- Key: `antigravityUnifiedStateSync.trajectorySummaries`
- Format: base64 → protobuf (parsed by `shared/backups.ts`)

---

## Pending Work

### High Priority
- [ ] **Paginated step fetch** — test `GetCascadeTrajectorySteps` with `startIndex`/`endIndex` to recover large conversations
- [ ] **Incremental backup** — skip unchanged conversations via `lastModifiedTime`

### Medium Priority
- [ ] **Scheduled backups** — auto-backup on interval or workspace close
- [ ] **Backup viewer** — browse backed-up conversations in the webview panel

### Future
- [ ] **AI summarization** — generate summaries for step-less conversations (opt-in, consumes tokens)
- [ ] **Export formats** — HTML, PDF
