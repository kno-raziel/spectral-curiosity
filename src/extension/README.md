# src/extension — VS Code / Antigravity Extension

Webview-based extension that provides the same React UI inside the editor.

## Features

- 📂 Auto-detects workspaces from Antigravity's sidebar
- 🔍 Search & filter conversations by title, artifacts, workspace, or status
- 🔄 Reassign conversations to different workspaces
- 📝 View AI artifacts — summaries, content previews, and metadata
- 💾 Save changes with automatic backups
- 📊 Diff backup snapshots to track changes over time

## Architecture

```
extension.ts          # activate/deactivate — registers command
  └── SpectralPanel.ts  # Creates webview, injects HTML + CSS + JS
        └── messageHandler.ts  # Routes postMessage requests to shared/ modules
              └── adapter.ts   # DbAdapter impl using better-sqlite3
```

The extension reuses the **same React SPA** from `src/client/` — the client's `api.ts` detects the webview environment and switches from HTTP fetch to `postMessage` transport automatically.

## Build

```bash
# Install deps + rebuild native module + bundle
bun run build:ext

# Package as .vsix
bun run package:ext

# Watch mode for development
bun run watch:ext
```

The build uses `esbuild.mjs` which bundles:
- Extension host: `extension.ts` + `SpectralPanel.ts` + `messageHandler.ts` + `adapter.ts` + `shared/`
- Webview: `client/main.tsx` + all client components
- CSS: Compiled Tailwind output

## Native Module

Uses `better-sqlite3` with `electron-rebuild` to match the VS Code Electron version.

## Usage

Open the command palette (`Cmd+Shift+P`) and run:

```
Spectral Curiosity: Open Workspace Manager
```
