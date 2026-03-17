# src/server — Bun API Server

The server package provides the full-stack Bun server with API routes and React SPA serving.

## Entry Point

`index.ts` — Single file that configures `Bun.serve()` with:
- **HMR** enabled for development
- **Route-based API** (no Express, no middleware)
- **React SPA catch-all** via Bun HTML import (`index.html`)

## API Routes

| Route                  | Method | Description                       |
|------------------------|--------|-----------------------------------|
| `/api/conversations`   | GET    | Load all conversations with metadata |
| `/api/workspaces`      | GET    | List registered workspaces        |
| `/api/save`            | POST   | Save assignment and rename changes |
| `/api/paths`           | GET    | Return platform paths (DB, brain) |
| `/api/backups`         | GET    | List backup snapshots             |
| `/api/backups/diff`    | GET    | Diff two backup snapshots         |

## Adapter

`adapter.ts` implements the shared `DbAdapter` interface using `bun:sqlite`. Called via `initBunAdapters()` before any data access.

## Static Assets

- `/dist/app.css` — Compiled Tailwind CSS
- `/src/shared/icon.svg` — App favicon
