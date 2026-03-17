# ⚡ Spectral Curiosity

**Antigravity Workspace Manager** — A zero-dependency tool to explore, search, and manage your [Antigravity](https://antigravity.dev) AI conversation workspace associations.

Runs as a **Bun full-stack app** or as a **VS Code / Antigravity extension**.

---

## Features

- 📂 **Auto-detects workspaces** from Antigravity's sidebar database
- 🔍 **Search & filter** conversations by title, artifacts, workspace, or status
- 🔄 **Reassign** conversations to different workspaces (with protobuf encoding)
- 📝 **View AI artifacts** — summaries, content previews, and metadata
- ➕ **Add new workspaces** for assignment
- 💾 **Save changes** back to the Antigravity database (with automatic backups)
- 🔐 **Cross-platform** — macOS, Linux, and Windows

## Stack

| Layer    | Technology                  |
|----------|------------------------------|
| Runtime  | [Bun](https://bun.sh) 1.3+  |
| Frontend | React 19                     |
| Backend  | `Bun.serve()` (routes API)   |
| Database | `bun:sqlite` / `better-sqlite3` |
| Linting  | Biome 2                      |
| Types    | TypeScript 5.9 (strict)      |
| HMR      | Built-in (Bun)               |

## Quick Start

```bash
# Install dependencies
bun install

# Start dev server (API + React SPA + HMR on port 3000)
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Extension

```bash
# Build the VS Code / Antigravity extension
bun run build:ext

# Package as .vsix
cd src/extension && npx vsce package

# Install in Antigravity
antigravity --install-extension src/extension/spectral-extension-0.1.0.vsix
```

## Scripts

```bash
bun run dev        # Start full-stack dev server with HMR
bun run build      # Production build → dist/
bun run build:ext  # Install extension deps + build
bun run watch:ext  # Extension watch mode (dev)
bun run check      # Run typecheck + lint
bun run typecheck  # TypeScript strict type checking
bun run lint       # Biome lint
bun run lint:fix   # Biome lint + auto-fix
bun run format     # Biome format
```

## Project Structure

```
spectral-curiosity/
├── AGENTS.md              # Universal AI agent context
├── CLAUDE.md              # Claude-specific context
├── src/
│   ├── client/            # React UI
│   │   ├── App.tsx        # Main React component
│   │   ├── api.ts         # Environment-aware API (fetch / postMessage)
│   │   ├── main.tsx       # Entry point
│   │   ├── index.css      # Tailwind CSS v4 theme + keyframes
│   │   ├── components/    # React components (co-located folders)
│   │   │   ├── BackupPanel/
│   │   │   ├── ConversationCard/
│   │   │   ├── Header/       # Header + FilterBar
│   │   │   └── Toast/
│   │   └── hooks/         # Custom hooks
│   ├── shared/            # Shared data layer (platform-agnostic)
│   │   ├── database.ts    # DbAdapter interface
│   │   ├── types.ts       # Shared TypeScript types
│   │   ├── assignments.ts # Workspace assignment logic
│   │   ├── backups.ts     # Backup listing & diffs
│   │   ├── conversations.ts # Conversation loading
│   │   ├── protobuf.ts    # Protobuf encoding/decoding
│   │   ├── paths.ts       # Cross-platform path constants
│   │   ├── trajectories.ts # Trajectory entry parsing
│   │   └── workspaces.ts  # Workspace management
│   ├── server/            # Bun API server
│   │   ├── index.ts       # Bun.serve() — API routes + React SPA
│   │   └── adapter.ts     # DbAdapter impl (bun:sqlite)
│   └── extension/         # VS Code / Antigravity extension
│       ├── extension.ts   # Extension entry point
│       ├── SpectralPanel.ts # Webview panel
│       ├── messageHandler.ts # Webview ↔ host message router
│       ├── adapter.ts     # DbAdapter impl (better-sqlite3)
│       ├── esbuild.mjs    # Extension build config
│       ├── package.json   # Extension manifest
│       └── tsconfig.json  # Extension TypeScript config
├── index.html             # HTML entry (Bun HTML import)
├── biome.json             # Biome linter/formatter config
├── tsconfig.json          # Root TypeScript config
└── package.json           # Root dependencies & scripts
```

### Architecture

The `src/shared/` module provides a **`DbAdapter` interface** that abstracts SQLite access. Both the Bun server (`bun:sqlite`) and the VS Code extension (`better-sqlite3`) inject their own implementation at startup. This eliminates code duplication while supporting both runtimes.

```
client (React) ─── shared (data layer) ─┬─ server/adapter.ts  (bun:sqlite)
                                         └─ extension/adapter.ts (better-sqlite3)
```

## How It Works

1. Reads Antigravity's `state.vscdb` SQLite database to find conversations and workspace associations
2. Parses protobuf-encoded conversation metadata (titles, workspace URIs)
3. Scans the `~/.gemini/antigravity/brain/` directory for AI-generated artifacts
4. Presents everything in a searchable, filterable React UI
5. Allows reassigning conversations — writes modified protobuf back to the database

## Adding Workspaces

Click **+ Workspace** in the filter bar and provide:
- **Name** — Display name (e.g., `my-project`)
- **URI** — Full path (e.g., `/Users/you/projects/my-project`)

Workspaces are saved to `~/.gemini/antigravity/spectral-workspaces.json`.

## License

MIT
