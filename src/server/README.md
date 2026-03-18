# src/server — Bun API Server

The server package provides the full-stack Bun server with API routes and React SPA serving.

## Entry Point

`index.ts` — Single file that configures `Bun.serve()` with:
- **HMR** enabled for development
- **Route-based API** (no Express, no middleware)
- **React SPA catch-all** via Bun HTML import (`index.html`)

## API Routes

| Route                    | Method | Description                              |
|--------------------------|--------|------------------------------------------|
| `/api/conversations`     | GET    | Load all conversations with metadata     |
| `/api/workspaces`        | GET    | List registered workspaces               |
| `/api/save`              | POST   | Save assignment and rename changes       |
| `/api/paths`             | GET    | Return platform paths (DB, brain)        |
| `/api/snapshots`         | GET    | List backup snapshots                    |
| `/api/snapshots/diff`    | GET    | Diff two backup snapshots                |
| `/api/backups/config`    | GET/POST | Get or update backup directory config  |
| `/api/backups`           | GET    | Backup viewer — list backups             |
| `/api/backups/*`         | GET    | Backup viewer — dynamic path params      |

## Sub-modules

| File                      | Purpose                                         |
|---------------------------|--------------------------------------------------|
| `adapter.ts`              | DbAdapter impl using `bun:sqlite`               |
| `routes/backup-viewer.ts` | Backup viewer route handler for `/api/backups/*` |

## Static Assets

- `/dist/app.css` — Compiled Tailwind CSS
- `/src/shared/icon.svg` — App favicon

