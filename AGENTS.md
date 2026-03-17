# AGENTS.md — Spectral

Universal AI agent context for Spectral.

## Project Overview

**Spectral** is an Antigravity Backup & Sync tool — a zero-dependency tool to backup, export, and manage [Antigravity](https://antigravity.dev) AI conversations. Runs as a **Bun full-stack app** or as a **VS Code / Antigravity extension**.

## Tech Stack

| Layer     | Technology                               |
|-----------|------------------------------------------|
| Runtime   | [Bun](https://bun.sh) 1.3+              |
| Frontend  | React 19                                 |
| Backend   | `Bun.serve()` (route-based API)          |
| Database  | `bun:sqlite` / `better-sqlite3`          |
| Styling   | Tailwind CSS v4 (theme + utilities)      |
| Linting   | Biome 2                                  |
| Types     | TypeScript 5.9 (`strict: true`)          |
| HMR       | Built-in (Bun)                           |

## Architecture

A shared `DbAdapter` interface abstracts SQLite access. Both runtimes inject their own implementation:

```
client (React) ─── shared (data layer) ─┬─ server/adapter.ts  (bun:sqlite)
                                         └─ extension/adapter.ts (better-sqlite3)
```

## Package Structure

```
src/
├── client/     # React SPA (components, hooks, API layer, CSS)
├── server/     # Bun.serve() — API routes + React SPA serving
├── shared/     # Platform-agnostic data layer (types, DB, protobuf)
└── extension/  # VS Code / Antigravity extension (webview panel)
```

Each package has its own `README.md` with detailed documentation.

## Commands

```bash
bun run dev        # Full-stack dev server with HMR (port 3000)
bun run build      # Production build → dist/
bun run build:ext  # Build VS Code extension
bun run check      # TypeScript + Biome check
bun run typecheck  # tsc --noEmit
bun run lint       # Biome lint
bun run lint:fix   # Biome lint + auto-fix
bun run format     # Biome format
```

## Code Style

- **Biome 2** for linting and formatting
- **No `any`** — use `unknown` with type narrowing
- **Strict TypeScript** — `strict: true`, `noImplicitAny: true`
- Double quotes, semicolons, trailing commas
- 2-space indent, 100 char line width
- Organize imports automatically

## Conventions

- **Component co-location**: each component in its own folder with barrel `index.ts`
- **Environment-aware API**: `src/client/api.ts` detects webview vs browser and uses `postMessage` or `fetch`
- **Shared types**: all types in `src/shared/types.ts`
- **No barrel exports** in `shared/` — import specific modules directly
