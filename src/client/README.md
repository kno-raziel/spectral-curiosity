# src/client — React SPA

The client package contains the React 19 single-page application.

## Entry Points

| File       | Purpose                                    |
|------------|--------------------------------------------|
| `main.tsx` | React root mount (`#root`)                 |
| `App.tsx`  | Main app component, state, routing         |
| `api.ts`   | Environment-aware API (fetch / postMessage)|

## Components

Each component lives in its own folder with a barrel `index.ts`:

```
components/
├── BackupPanel/       # Backup listing, snapshot diff viewer
├── ConversationCard/  # Expandable conversation row with rename, reassign
├── Header/            # Header bar + FilterBar (search, filter, bulk actions)
└── Toast/             # Global toast notification system
```

## Hooks

| Hook                | Purpose                                   |
|---------------------|-------------------------------------------|
| `useConversations`  | Loads conversations + workspaces, manages pending changes, auto-refresh |

## Styling

- **Tailwind CSS v4** with `@theme` design tokens in `index.css`
- Custom keyframes: `spin`, `slideDown`, `slideUp`, `fadeIn`
- Dark theme with GitHub-inspired color palette

## Environment Detection

`api.ts` detects whether it runs in a VS Code webview or browser:
- **Webview**: uses `acquireVsCodeApi()` + `postMessage` transport
- **Browser**: uses standard HTTP `fetch` against the Bun server
