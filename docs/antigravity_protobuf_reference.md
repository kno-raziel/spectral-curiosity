# Antigravity `state.vscdb` — Complete Protobuf Reference

> Reverse-engineered from `state.vscdb` on 2026-03-23.
> All schemas were extracted programmatically using a read-only recursive protobuf parser.

## Overview

Antigravity stores **443 keys** in `ItemTable`. Of these, **17 are base64-encoded protobuf blobs** under the `antigravityUnifiedStateSync.*` namespace. The rest are JSON, plain strings, or numbers (standard VS Code state).

## Key Inventory

| Key (suffix after `antigravityUnifiedStateSync.`) | Size (bytes) | Root fields | Purpose |
|---|---|---|---|
| `trajectorySummaries` | 54,663 | 94 (repeated) | Conversation index — titles, workspaces, timestamps, history |
| `sidebarWorkspaces` | 3,902 | 22 (repeated) | Workspace list shown in sidebar |
| `artifactReview` | 38,717 | 74 (repeated) | Artifact review comments/metadata per conversation |
| `theme` | 13,886 | 1 | Full color theme (JSON blob inside protobuf wrapper) |
| `userStatus` | 3,924 | 1 | User profile, email, model tier info |
| `oauthToken` | 548 | 1 | OAuth access + refresh tokens |
| `agentPreferences` | 291 | 6 | Agent execution policies (terminal auto-exec, artifact review) |
| `agentManagerWindow` | 142 | 5 | Window dimensions (width, height, X, Y) |
| `browserPreferences` | 122 | 2 | Browser allowlist, JS execution config |
| `modelCredits` | 85 | 2 | Available credits, minimum credit threshold |
| `onboarding` | 62 | 1 | Post-onboarding state (MANAGER_WELCOME) |
| `modelPreferences` | 50 | 1 | Last selected model sentinel |
| `overrideStore` | 40 | 1 | Secure mode enabled flag |
| `seenNuxIds` | 39 | 5 (repeated) | Seen "new user experience" IDs |
| `editorPreferences` | 38 | 1 | Demo mode enabled flag |
| `scratchWorkspaces` | 139 | 1 | Current reserved scratch workspace URI |
| `enterprisePreferences` | 34 | 1 | Enterprise GCP project ID |
| `tabPreferences` | 0 | — | Empty |
| `windowPreferences` | 0 | — | Empty |

---

## Detailed Schemas

### `trajectorySummaries` — Conversation Index

The largest and most important blob. Each entry represents one conversation.

```protobuf
// Outer: repeated entries
message TrajectorySummaries {
  repeated Entry entries = 1;         // 94 entries observed
}

message Entry {
  string conversation_id = 1;        // UUID
  InfoWrapper info = 2;
}

message InfoWrapper {
  string info_b64 = 1;               // Base64 → InnerInfo
}

message InnerInfo {
  string title = 1;                   // "Migrating to Bun Dev Server"
  int32  message_count = 2;          // e.g. 621
  Timestamp created = 3;
  string conversation_uuid = 4;      // Duplicate UUID
  int32  unknown_5 = 5;              // Always 1?
  Timestamp modified = 7;
  WorkspaceAssociation workspace = 9; // See below
  Timestamp accessed = 10;
  ConversationHistory history = 12;   // Large blob
  bytes  unknown_14 = 14;            // Compressed/encoded blob
  PinnedInfo pinned = 15;
  int32  unknown_16 = 16;            // e.g. 525
  LastSession last_session = 17;
}

message Timestamp {
  int64 seconds = 1;                  // Unix epoch seconds
  int32 nanos = 2;                    // Nanosecond fraction
}

message WorkspaceAssociation {
  string uri = 1;                     // file:///path/to/workspace
  string uri_dup = 2;                 // Same URI (always duplicated)
  GitInfo git = 3;                    // Optional
  string branch = 4;                  // "main"
}

message GitInfo {
  string slug = 1;                    // "user/repo"
  string remote = 2;                  // "git@github.com:user/repo.git"
}

message ConversationHistory {
  bytes  data = 1;                    // Opaque blob
  int32  count = 2;                   // Number of messages
}

message LastSession {
  string workspace_uri = 1;          // file:///path/to/workspace
  bytes  timestamp = 2;              // Encoded timestamp
  string session_id = 3;             // UUID
  string workspace_uri_display = 7;  // Same as field 1
}
```

### `sidebarWorkspaces` — Workspace List

```protobuf
message SidebarWorkspaces {
  repeated WorkspaceEntry entries = 1;  // 22 entries
}

message WorkspaceEntry {
  string uri = 1;                     // "file:///path/to/workspace"
  InfoWrapper info = 2;               // Base64 → workspace metadata
}

// Inner workspace metadata
message WorkspaceInfo {
  string uri = 4;                     // file:///path/to/workspace
  Settings settings = 5;             // Contains varint preferences
}
```

### `artifactReview` — Conversation Artifact Reviews

```protobuf
message ArtifactReviews {
  repeated ReviewEntry entries = 1;   // 74 entries
}

message ReviewEntry {
  string artifact_path = 1;           // file:///path/to/brain/{cid}/artifact.md
  ReviewData data = 2;
}

message ReviewData {
  string json_blob = 1;              // JSON: { comments: [], artifactMetadata: "base64..." }
}
```

### `userStatus` — User Profile

```protobuf
message UserStatusWrapper {
  UserStatusEntry entry = 1;
}

message UserStatusEntry {
  string key = 1;                     // Base64 key
  UserStatusData data = 2;
}

message UserStatusData {
  string data_b64 = 1;               // Base64 → UserProfile
}

message UserProfile {
  int32  unknown_2 = 2;              // Always 1?
  string display_name = 3;           // "Victor Cano (kno raziel)"
  string email = 7;                  // user email
  ModelTiers tiers = 33;             // Available model tiers
  ModelInfo model = 36;              // Current model info
}

message ModelTiers {
  repeated bytes tier_data = 1;       // 6 tier blobs observed
  bytes summary = 2;
  bytes unknown_3 = 3;
}
```

### `oauthToken` — Authentication

```protobuf
message OAuthWrapper {
  OAuthEntry entry = 1;
}

message OAuthEntry {
  string key = 1;                     // Base64 key
  OAuthData data = 2;
}

message OAuthData {
  string data_b64 = 1;               // Base64 → OAuthTokens
}

message OAuthTokens {
  string access_token = 1;           // ya29.a0ATk...
  string token_type = 2;             // "Bearer"
  string refresh_token = 3;          // 1//01CP3x...
  Timestamp expiry = 4;              // Epoch seconds
}
```

### Config/Preference Keys (Common Pattern)

Most preference keys use a sentinel-key/value pattern:

```protobuf
message PreferenceStore {
  repeated PreferenceEntry entries = 1;
}

message PreferenceEntry {
  // Encoded as a single string containing both key and value:
  //   sentinel_key_name → base64_encoded_value
  // Example: "terminalAutoExecutionPolicySentinelKey" → "EAM=" (varint 3)
}
```

| Key | Sentinel | Decoded value |
|-----|----------|---------------|
| `agentPreferences` | `terminalAutoExecutionPolicySentinelKey` | Varint (enum) |
| | `artifactReviewPolicySentinelKey` | Varint (enum) |
| `editorPreferences` | `demoModeEnabledSentinelKey` | Boolean |
| `enterprisePreferences` | `enterpriseGcpProjectId` | String |
| `modelPreferences` | `last_selected_agent_model_sentinel_key` | Varint |
| `overrideStore` | `secureModeEnabledSentinelKey` | Boolean |
| `modelCredits` | `availableCreditsSentinelKey` | Float |
| | `minimumCreditAmountForUsageKey` | Float |
| `agentManagerWindow` | `managerWidth`, `managerHeight`, `managerX`, `managerY` | Float |

### `seenNuxIds` — New User Experience Tracking

```protobuf
message SeenNux {
  repeated NuxEntry entries = 1;      // 5 entries observed
}

message NuxEntry {
  string nux_id = 1;                  // "4", "11", "12", etc.
  bytes  empty = 2;                   // Always empty
}
```

---

## Non-Protobuf Notable Keys

| Key | Type | Purpose |
|-----|------|---------|
| `google.antigravity` | JSON | Installation ID, workspace cascade map |
| `antigravityAuthStatus` | JSON | User name, API key |
| `content.trust.model.key` | JSON | Trusted workspace folders |
| `terminal.history.entries.commands` | JSON | Terminal command history |
| `terminal.history.entries.dirs` | JSON | Terminal directory history |
| `chat.ChatSessionStore.index` | JSON | Chat session metadata |
| `colorThemeData` | JSON | Full color theme definition |
| `iconThemeData` | JSON | Icon theme (Symbols Icons) |
