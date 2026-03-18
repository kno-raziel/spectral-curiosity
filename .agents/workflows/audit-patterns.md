---
description: Bottom-up audit for pattern consistency, stale docs, and code hygiene
---

# Pattern Consistency Audit

Audit the codebase bottom-up for inconsistent patterns, duplicated logic, and stale documentation.

## Steps

### 1. Enumerate branches

List all top-level directories under `src/`. Each is a "branch" to audit independently:

```
src/client/
src/server/
src/shared/
src/extension/
src/extension/sdk/
```

### 2. Per-branch: Code patterns

For each branch, check:

- [ ] **Import consistency** — are there multiple files importing the same external module using different patterns? (e.g. one static `import`, another lazy `require()`)
- [ ] **Duplicated logic** — are there functions/types defined in more than one file that should be centralized?
- [ ] **Error handling** — is the same type of error handled differently across sibling files?
- [ ] **Naming conventions** — do files follow the same naming pattern? (e.g. `kebab-case` vs `camelCase`)

### 3. Per-branch: Documentation

For each branch that has a `README.md`:

- [ ] **Architecture diagram** — does it match the actual file tree?
- [ ] **Dependencies mentioned** — are they the current ones? (e.g. not referencing removed packages)
- [ ] **Commands/instructions** — do the documented build/install commands actually work?
- [ ] **Comments in code** — do any comments reference outdated behavior or removed modules?

### 4. Sync upward

After auditing all branches:

- [ ] **`AGENTS.md`** — does the tech stack table, architecture diagram, and conventions section reflect reality?
- [ ] **Root `README.md`** — are install/build/usage instructions current?
- [ ] **`package.json` scripts** — do documented scripts exist and work?

### 5. Report

Create a concise report listing:

1. **Findings** — what's inconsistent or stale (with file paths)
2. **Fixes applied** — what was corrected during the audit
3. **Recommendations** — remaining items that need user decision

> **Important**: Fix obvious issues (stale comments, wrong package names) in-place. Only flag items that require architectural decisions.
