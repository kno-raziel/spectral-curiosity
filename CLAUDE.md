# CLAUDE.md — Spectral

@import AGENTS.md

## Claude-Specific Guidelines

### Component Pattern

Components use **co-located folders** with barrel exports:

```
components/ComponentName/
├── ComponentName.tsx    # Main component
├── SubComponent.tsx     # Optional composition pieces
└── index.ts             # Barrel: export { ComponentName } from "./ComponentName"
```

When creating or modifying components:
1. Always place in its own folder under `src/client/components/`
2. Export through `index.ts` — never import the `.tsx` file directly from outside the folder
3. Keep related sub-components in the same folder

### Key Files

- `src/client/api.ts` — Environment-aware API layer (detects webview vs browser)
- `src/shared/types.ts` — All shared TypeScript interfaces
- `src/shared/database.ts` — `DbAdapter` interface that both server and extension implement
- `biome.json` — Linting/formatting config (Tailwind directives enabled)

### Important Context

- The app reads Antigravity's `state.vscdb` SQLite database
- Protobuf encoding/decoding is handled in `src/shared/protobuf.ts`
- The extension uses `node-sqlite3-wasm` (WebAssembly — no native bindings, no electron-rebuild)
- CSS uses Tailwind v4 `@theme` for design tokens — custom properties, not `tailwind.config`
