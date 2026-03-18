# src/extension — VS Code / Antigravity Extension

Webview-based extension that provides the same React UI inside the editor.

## Features

- 📂 Auto-detects workspaces from Antigravity's sidebar
- 🔍 Search & filter conversations by title, artifacts, workspace, or status
- 🔄 Reassign conversations to different workspaces
- 📝 View AI artifacts — summaries, content previews, and metadata
- 💾 Backup conversations, brain, knowledge, and skills
- 📊 Diff backup snapshots to track changes over time

## Architecture

```
extension.ts            # activate/deactivate — registers commands
  ├── SpectralPanel.ts   # Creates webview, injects HTML + CSS + JS
  │     └── messageHandler.ts  # Routes postMessage to shared/ modules
  │           └── adapter.ts   # DbAdapter impl using sqlite-loader
  └── sdk/
        ├── sqlite-loader.ts   # ⚠️ ALL sqlite access goes through here
        ├── backup-engine.ts   # Orchestrates full/incremental backups
        ├── backup-estimator.ts # Estimates backup size per category
        ├── backup-scheduler.ts # Auto-backup interval management
        ├── connection.ts      # Connection management
        ├── markdown-export.ts # Markdown export functionality
        ├── sdk-manager.ts     # Manages Antigravity SDK lifecycle
        ├── ls-client.ts       # Language Server RPC client
        └── ls-types.ts        # Language Server type definitions
```

The extension reuses the **same React SPA** from `src/client/` — the client's `api.ts` detects the webview environment and switches from HTTP fetch to `postMessage` transport automatically.

## Build

```bash
npm run build      # Bundle with esbuild
npm run watch      # Watch mode for development
npm run typecheck   # tsc --noEmit
```

## Packaging

```bash
# Package as .vsix (MUST include node_modules/)
npx @vscode/vsce package

# Install in Antigravity
antigravity --install-extension spectral-extension-0.1.0.vsix
```

> **⚠️ Never use `--no-dependencies`** — the VSIX must include `node_modules/node-sqlite3-wasm/` and `node_modules/antigravity-sdk/`.

## SQLite Access

Uses `node-sqlite3-wasm` (WebAssembly port — no native bindings, no electron-rebuild).

**All access goes through `sdk/sqlite-loader.ts`** — never import `node-sqlite3-wasm` directly. The loader uses lazy `require()` with try/catch so the extension always activates, even if the WASM module is unavailable.

