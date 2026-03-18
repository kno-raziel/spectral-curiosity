---
name: Code Hygiene & Documentation Patterns
description: Conventions for keeping code patterns consistent and documentation in sync with reality.
---

# Code Hygiene & Documentation Patterns

## Core Principle

> **The code is the documentation.** Module structure, file names, and TSDoc comments should make patterns obvious. External docs (READMEs, AGENTS.md) exist only to summarize what the code already communicates.

## When to Apply

- After implementing a new feature that introduces a new pattern (loader, adapter, SDK wrapper)
- Before a PR or commit that touches multiple files in the same directory
- Periodically, to catch drift between code and documentation

## Conventions

### 1. One pattern per concern

If multiple files depend on the same external module or subsystem, there must be **one centralized entry point**. Every consumer imports from the entry point — never directly.

**Example:**
```
✅  adapter.ts       → import { createDatabase } from "./sdk/sqlite-loader"
✅  backup-engine.ts → import { loadSqliteModule } from "./sdk/sqlite-loader"
❌  adapter.ts       → import { Database } from "node-sqlite3-wasm"  // NEVER
```

### 2. TSDoc as the source of truth

Every centralized module must have a top-level JSDoc block that states:
- What it does
- Who should use it
- What NOT to do

```typescript
/**
 * Centralized lazy loader for node-sqlite3-wasm.
 *
 * ALL sqlite access in the extension MUST go through this module.
 * Never import `node-sqlite3-wasm` directly.
 */
```

### 3. READMEs reflect the file tree

Each `src/*/README.md` must include an architecture diagram that matches the actual files. If a file is added or removed, the README must be updated.

### 4. AGENTS.md stays in sync

The root `AGENTS.md` Conventions section must list every "centralized entry point" pattern. This is the first thing an AI agent reads.

## Audit Workflow

To run a full audit, follow the workflow at:

**[`.agents/workflows/audit-patterns.md`](file:///audit-patterns.md)**

Use the slash command: `/audit-patterns`
