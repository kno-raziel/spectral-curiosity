/**
 * Bun 1.3 full-stack server for Spectral Curiosity
 *
 * Single process: API routes + React SPA with HMR.
 * No Vite, no CORS, no concurrently.
 */

import app from "../../index.html";
import { saveAssignments } from "../shared/assignments";
import { diffSnapshots, listBackups } from "../shared/backups";
import { loadConversations } from "../shared/conversations";
import { BRAIN_DIR, CONVERSATIONS_DIR, DB_PATH } from "../shared/paths";
import { loadWorkspaces } from "../shared/workspaces";
import { initBunAdapters } from "./adapter";

// Initialize platform adapters before any data access
initBunAdapters();

const PORT = 3000;

Bun.serve({
  port: PORT,
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    // ── Static assets ────────────────────────────────
    "/dist/app.css": {
      GET: () =>
        new Response(Bun.file("dist/app.css"), {
          headers: { "Content-Type": "text/css" },
        }),
    },
    "/src/shared/icon.svg": {
      GET: () =>
        new Response(Bun.file("src/shared/icon.svg"), {
          headers: { "Content-Type": "image/svg+xml" },
        }),
    },

    // ── API Routes ──────────────────────────────────
    "/api/conversations": {
      GET: async () => {
        try {
          const workspaces = await loadWorkspaces();
          const conversations = await loadConversations(workspaces);
          return Response.json(conversations);
        } catch (err) {
          console.error("[GET /api/conversations]", err);
          return Response.json({ error: "Failed to load conversations" }, { status: 500 });
        }
      },
    },

    "/api/workspaces": {
      GET: async () => {
        try {
          const workspaces = await loadWorkspaces();
          return Response.json(workspaces);
        } catch (err) {
          console.error("[GET /api/workspaces]", err);
          return Response.json({ error: "Failed to load workspaces" }, { status: 500 });
        }
      },
    },

    "/api/save": {
      POST: async (req: Request) => {
        try {
          const payload = (await req.json()) as {
            assignments?: Record<string, string>;
            renames?: Record<string, string>;
          };
          const workspaces = await loadWorkspaces();
          const result = await saveAssignments(
            {
              assignments: payload.assignments ?? {},
              renames: payload.renames ?? {},
            },
            workspaces,
          );
          return Response.json(result);
        } catch (err) {
          console.error("[POST /api/save]", err);
          return Response.json({ error: "Failed to save changes" }, { status: 500 });
        }
      },
    },

    "/api/paths": {
      GET: () =>
        Response.json({
          db: DB_PATH,
          brain: BRAIN_DIR,
          conversations: CONVERSATIONS_DIR,
        }),
    },

    "/api/backups": {
      GET: async () => {
        try {
          const backups = await listBackups();
          return Response.json(backups);
        } catch (err) {
          console.error("[GET /api/backups]", err);
          return Response.json({ error: "Failed to list backups" }, { status: 500 });
        }
      },
    },

    "/api/backups/diff": {
      GET: async (req: Request) => {
        try {
          const url = new URL(req.url);
          const a = url.searchParams.get("a") ?? "current";
          const b = url.searchParams.get("b") ?? "current";
          const result = diffSnapshots(a, b);
          return Response.json(result);
        } catch (err) {
          console.error("[GET /api/backups/diff]", err);
          return Response.json({ error: "Failed to diff snapshots" }, { status: 500 });
        }
      },
    },

    // ── React SPA (catch-all) ────────────────────────
    "/*": app,
  },
});

console.log();
console.log("═══════════════════════════════════════════════");
console.log("  ⚡ Spectral Curiosity — Bun Full-Stack");
console.log("═══════════════════════════════════════════════");
console.log();
console.log(`  App:  http://localhost:${PORT}`);
console.log(`  API:  http://localhost:${PORT}/api/*`);
console.log(`  HMR:  enabled`);
console.log(`  DB:   ${DB_PATH}`);
console.log(`  Brain: ${BRAIN_DIR}`);
console.log();
