# Plan: Standalone Binary + Backup Viewer

## Goal

Compile Spectral Curiosity into a standalone executable binary using `bun build --compile` and add a Backup Viewer UI that allows users to navigate, search, and read their exported conversations without Antigravity installed.

## Background

After Phase 1 (Extension SDK Backup) exports conversations to a portable JSON + Markdown format, users need a way to browse that data independently. This plan produces a zero-dependency binary that serves the existing React UI and adds a dedicated Backup Viewer mode.

> [!IMPORTANT]
> This plan depends on the **backup format** defined in [Phase 1.2 of plan_extension_sdk_backup.md](./plan_extension_sdk_backup.md). The `manifest.json` schema and directory structure must be finalized before implementing the reader.

---

## Phases

### Phase 2.0 — Binary Compilation Pipeline

**Goal:** Produce standalone executables for macOS, Linux, and Windows.

#### Tasks

- [ ] Add `build:binary` script to `package.json`
- [ ] Configure `bun build --compile` with embedded assets (HTML, CSS, JS)
- [ ] Test compilation on macOS (arm64)
- [ ] Add cross-compilation targets (linux-x64, windows-x64)
- [ ] Verify the binary starts, serves the React SPA, and accesses `state.vscdb`
- [ ] Document binary size and startup time

#### Commands

```bash
# Development build (current platform)
bun build --compile src/server/index.ts --outfile dist/spectral-curiosity

# Cross-platform release builds
bun build --compile --target=bun-darwin-arm64 src/server/index.ts --outfile dist/spectral-curiosity-macos-arm64
bun build --compile --target=bun-darwin-x64 src/server/index.ts --outfile dist/spectral-curiosity-macos-x64
bun build --compile --target=bun-linux-x64 src/server/index.ts --outfile dist/spectral-curiosity-linux-x64
bun build --compile --target=bun-windows-x64 src/server/index.ts --outfile dist/spectral-curiosity.exe
```

#### Files

- `package.json` — add `build:binary` and `build:binary:all` scripts

---

### Phase 2.1 — Backup Reader (Shared Module)

**Goal:** Implement the `backup-reader` module in `src/shared/` so both runtimes can consume backup directories.

#### Tasks

- [ ] Implement `BackupReader` class: read `manifest.json`, list conversations, parse `metadata.json`, load `messages.json`
- [ ] Implement search across backed-up conversations (title, content full-text)
- [ ] Implement filtering (by date range, workspace, tag)
- [ ] Handle multiple backup directories (list all, compare)

#### Files

- `src/shared/backup-reader.ts` — core reader logic
- `src/shared/backup-types.ts` — TypeScript types for backup format (from Phase 1.2)

---

### Phase 2.2 — Backup Viewer API Routes

**Goal:** Add API routes to the Bun server for serving backup data.

#### Tasks

- [ ] Add `GET /api/backups` — list available backup directories
- [ ] Add `GET /api/backups/:id` — get manifest for a specific backup
- [ ] Add `GET /api/backups/:id/conversations` — list conversations in backup
- [ ] Add `GET /api/backups/:id/conversations/:convId` — get full conversation content
- [ ] Add `GET /api/backups/:id/conversations/:convId/messages` — get messages
- [ ] Add `GET /api/backups/:id/knowledge` — list Knowledge Items
- [ ] Add `GET /api/backups/:id/search?q=term` — full-text search
- [ ] Support configurable backup root path via CLI argument or env var

#### Files

- `src/server/routes/backups.ts` — backup API route handlers
- `src/server/index.ts` — mount backup routes

---

### Phase 2.3 — Backup Viewer UI

**Goal:** React UI for browsing backed-up conversations.

#### Tasks

- [ ] Add a "Backups" tab/view to the existing React app
- [ ] Backup list view: show all backups with date, conversation count, size
- [ ] Conversation list view: show conversations within a backup (searchable, filterable)
- [ ] Conversation detail view: render messages as a chat-like UI
  - User messages vs AI messages (distinct styling)
  - Code blocks with syntax highlighting
  - Tool calls / file edits displayed
- [ ] Knowledge Items viewer: browse KIs from backup
- [ ] Search: full-text search across all conversations in a backup
- [ ] Diff view: compare two backups (what changed)

#### Files

- `src/client/components/BackupViewer/` — new component folder
  - `BackupList.tsx` — list of available backups
  - `ConversationList.tsx` — conversations within a backup
  - `ConversationDetail.tsx` — message history viewer
  - `MessageBubble.tsx` — individual message rendering
  - `KnowledgeViewer.tsx` — KI browser
  - `SearchView.tsx` — search results
- `src/client/hooks/useBackups.ts` — data fetching hooks
- `src/client/api.ts` — add backup API endpoints

---

### Phase 2.4 — CLI Mode

**Goal:** Support command-line usage for scripting and automation.

#### Tasks

- [ ] Parse CLI args: `spectral-curiosity [command] [options]`
- [ ] `spectral-curiosity serve` — start web server (default behavior)
- [ ] `spectral-curiosity serve --backup-dir ~/my-backups` — serve with backup viewer
- [ ] `spectral-curiosity export --format json --output ./export` — export from `state.vscdb` (no SDK, file-level only)
- [ ] `spectral-curiosity info` — show detected Antigravity installation info

#### Files

- `src/server/cli.ts` — CLI argument parser
- `src/server/index.ts` — integrate CLI parsing

---

### Phase 2.5 — Distribution

**Goal:** Publish binaries and make the tool easy to install.

#### Tasks

- [ ] GitHub Actions workflow: build binaries on tag push
- [ ] Create GitHub Release with artifacts (macOS, Linux, Windows)
- [ ] Add `npx spectral-curiosity` support (npm package with `bin` field)
- [ ] Update README with installation instructions for all methods
- [ ] Add Homebrew formula (future, optional)

#### Files

- `.github/workflows/release.yml` — CI/CD release pipeline
- `package.json` — `bin` field for npx support
- `README.md` — installation documentation

---

## Verification Plan

### Phase 2.0 (Binary Compilation)

1. Run `bun run build:binary`
2. Execute the resulting binary: `./dist/spectral-curiosity`
3. Verify: web server starts on port 3000
4. Verify: existing features work (workspace list, conversations, search)
5. Check binary size is reasonable (< 80MB)

### Phase 2.1–2.2 (Backup Reader + API)

1. **Prerequisite:** Have at least one backup directory from Phase 1
2. Run `bun run dev`
3. `curl http://localhost:3000/api/backups` → returns list of backups
4. `curl http://localhost:3000/api/backups/{id}/conversations` → returns conversations
5. `curl http://localhost:3000/api/backups/{id}/conversations/{conv}/messages` → returns messages
6. Verify search: `curl http://localhost:3000/api/backups/{id}/search?q=test` → returns results

### Phase 2.3 (Backup Viewer UI)

1. Open `http://localhost:3000` in browser
2. Click "Backups" tab
3. Verify: backup list shows with dates and counts
4. Click a backup → conversation list appears
5. Click a conversation → messages render with chat-like styling
6. Search for a term → results highlight
7. Test on mobile viewport (responsive)

### Phase 2.4 (CLI)

```bash
./dist/spectral-curiosity --help           # shows usage
./dist/spectral-curiosity serve            # starts server
./dist/spectral-curiosity info             # shows Antigravity paths
./dist/spectral-curiosity export --output /tmp/test-export  # exports
```

### Phase 2.5 (Distribution)

1. Push a git tag → GitHub Actions builds binaries
2. Check GitHub Release page for all three platform binaries
3. Test `npx spectral-curiosity serve` from a clean machine
