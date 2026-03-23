# Antigravity Protobuf Architecture

Spectral reads and writes Antigravity's internal database (`state.vscdb`) to manage
conversation metadata. This document describes the data model, known edge cases,
and how Spectral handles them.

## Data Sources

Conversations live in **two independent stores**:

| Source | Path | Contents | Written by |
|--------|------|----------|------------|
| `.pb` files | `~/.gemini/antigravity/conversations/*.pb` | Full conversation content | Antigravity LS |
| `trajectorySummaries` | `state.vscdb → ItemTable` | Protobuf index (title, workspace, timestamps) | Antigravity LS / Spectral |
| `sidebarWorkspaces` | `state.vscdb → ItemTable` | Sidebar workspace list | Antigravity LS / Spectral |

### Critical Invariant

**A conversation can exist on disk without a DB index entry.** This happens when:
- Antigravity's index gets corrupted or truncated
- The conversation was created while the LS was offline
- The `rebuild_conversations.py` script ran but Antigravity hasn't re-indexed

Spectral handles this by:
1. **Loading** from disk (`.pb` files) — always shows all conversations
2. **Enriching** with DB metadata (title, workspace) — gracefully falls back if missing
3. **Saving** creates new DB entries for orphaned conversations on demand

## Protobuf Schema (Reverse-Engineered)

### Outer Blob: `trajectorySummaries`

Base64-encoded. After decoding, it's a repeated list of entries:

```protobuf
// Repeated entries, each wrapped in field 1
message TrajectorySummaries {
  repeated Entry entries = 1;
}

message Entry {
  string conversation_id = 1;   // UUID (e.g. "bae7c659-31eb-45a0-...")
  InfoWrapper info = 2;         // Contains base64-encoded InnerInfo
}

message InfoWrapper {
  string info_b64 = 1;          // Base64 string → decode to get InnerInfo
}
```

### InnerInfo (base64-decoded from `InfoWrapper.info_b64`)

```protobuf
message InnerInfo {
  string title = 1;                 // Conversation title
  // field 2: varint (unknown purpose)
  string timestamp_created = 3;     // ISO-like date string
  string conversation_uuid = 4;     // Duplicate of outer UUID
  // field 5: varint (unknown purpose)
  string timestamp_modified = 7;    // ISO-like date string
  WorkspaceAssociation workspace = 9;
  string timestamp_accessed = 10;   // ISO-like date string
  bytes  conversation_history = 12; // Large blob, full message history
  bytes  unknown_14 = 14;           // Unknown
  string unknown_15 = 15;           // Unknown
  // field 16: varint (unknown purpose)
  bytes  unknown_17 = 17;           // Unknown
}
```

### Field 9: Workspace Association

```protobuf
message WorkspaceAssociation {
  string uri = 1;         // file:///path/to/workspace
  string uri_dup = 2;     // Same as uri (always duplicated)
  GitInfo git = 3;        // Optional, present when workspace is a git repo
  string branch = 4;      // Current branch (e.g. "main")
}

message GitInfo {
  string slug = 1;        // "user/repo"
  string remote = 2;      // "git@github.com:user/repo.git"
}
```

## Save Flow

```
User clicks "Save" in Spectral UI
  │
  ├─ POST /api/save { assignments: { cid → wsName }, renames: { cid → title } }
  │
  └─ saveAssignments()
       │
       ├─ 1. Backup:  cp state.vscdb → state.vscdb.backup_app_{timestamp}
       │
       ├─ 2. Read:    SELECT value FROM ItemTable WHERE key = 'trajectorySummaries'
       │
       ├─ 3. Parse:   parseTrajectoryEntries(decoded)
       │              Returns: entries (Map<cid, infoB64>)
       │                       rawEntries (Map<cid, Uint8Array>)  ← preserves root bytes
       │                       order (string[])
       │
       ├─ 4. Modify existing entries:
       │     For each cid in DB order:
       │       - Strip field 9 from inner blob
       │       - Inject new field 9 (buildField9)
       │       - Preserve all other root fields (timestamps, history)
       │
       ├─ 5. Create entries for orphaned conversations:     ← CRITICAL
       │     For each cid in assignments NOT in DB:
       │       - Build minimal inner blob (title + field 9)
       │       - Create root entry (cid + InfoWrapper)
       │
       ├─ 6. Update sidebarWorkspaces (ensures workspace appears in AG sidebar)
       │
       └─ 7. Write both blobs back to DB
```

## Known Pitfalls

### 1. Orphaned Conversations (Fixed)

**Problem:** Conversations without DB entries were silently skipped during save.
**Fix:** `rebuildEntries` now creates fresh entries for any CID in the save payload
that doesn't exist in the DB index.

### 2. Field Stripping

When modifying inner blobs, only the target field is stripped. All other fields
(including undocumented ones) are preserved byte-for-byte. This prevents
Antigravity's strict protobuf parser from rejecting the data.

### 3. Root Entry Preservation

Each root entry's raw bytes are captured during parsing. When writing back,
field 2 (the info wrapper) is stripped and replaced with the modified version,
while all other root fields remain untouched.

### 4. Antigravity LS Conflict

If Antigravity is running when Spectral saves, the LS will periodically
overwrite `state.vscdb` with its in-memory state, undoing Spectral's changes.
**Always close Antigravity before using Spectral's save feature.**

## Reference

The protobuf schema was reverse-engineered by:
1. Hex-dumping field 9 from native Antigravity conversations
2. Comparing with [rebuild_conversations.py](https://github.com/FutureisinPast/antigravity-conversation-fix)
3. Binary searching for known UUIDs in the raw DB blob
