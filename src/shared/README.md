# src/shared — Platform-Agnostic Data Layer

The shared package contains all business logic, types, and database abstractions used by both the Bun server and the VS Code extension.

## Modules

| Module                 | Purpose                                          |
|------------------------|--------------------------------------------------|
| `types.ts`             | All shared TypeScript interfaces                 |
| `database.ts`          | `DbAdapter` interface for SQLite abstraction     |
| `conversations.ts`     | Load and parse conversations from `state.vscdb`  |
| `assignments.ts`       | Save workspace assignments with backup creation  |
| `backups.ts`           | List backup snapshots and compute diffs          |
| `backup-format.ts`     | Backup format constants and parsers              |
| `backup-reader.ts`     | Full backup reader implementation                |
| `backup-reader-types.ts` | Type definitions for backup reader             |
| `protobuf.ts`          | Encode/decode protobuf conversation metadata     |
| `paths.ts`             | Cross-platform path constants (DB, brain dir)    |
| `trajectories.ts`      | Parse trajectory entries from conversation data  |
| `trajectory-types.ts`  | Extended trajectory type definitions             |
| `workspaces.ts`        | Load/save workspace registry                     |

## Architecture

```
DbAdapter interface
├── server/adapter.ts   → bun:sqlite  (Bun runtime)
└── extension/adapter.ts → node-sqlite3-wasm (WASM runtime)
```

Each runtime calls its `init*Adapters()` function at startup to inject the concrete implementation. All modules in `shared/` use the adapter through `database.ts` — never importing SQLite directly.

## Conventions

- **No barrel exports** — import specific modules: `import { loadConversations } from "../shared/conversations"`
- **No runtime-specific code** — everything here must work in both Bun and Node
