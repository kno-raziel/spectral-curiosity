#!/usr/bin/env bun
/**
 * Bun 1.3 full-stack server for Spectral
 *
 * Single process: API routes + React SPA with HMR.
 * No Vite, no CORS, no concurrently.
 */

import app from "../../index.html";
import { saveAssignments } from "../shared/assignments";
import { BackupReader } from "../shared/backup-reader";
import { diffSnapshots, listBackups } from "../shared/backups";
import { loadConversations } from "../shared/conversations";
import { BRAIN_DIR, CONVERSATIONS_DIR, DB_PATH } from "../shared/paths";
import { loadWorkspaces } from "../shared/workspaces";
import { initBunAdapters } from "./adapter";
import { handleBackupRoute } from "./routes/backup-viewer";

// Initialize platform adapters before any data access
initBunAdapters();

const PORT = 3000;

// Detect compiled binary mode (injected via --define at build time)
declare const IS_BUN_COMPILE: boolean;
const isCompiled = typeof IS_BUN_COMPILE !== "undefined" && IS_BUN_COMPILE;

// Initialize backup reader if a backup directory is configured
import { homedir } from "node:os";
import { join } from "node:path";

let currentBackupDir = process.env.SPECTRAL_BACKUP_DIR || join(homedir(), "antigravity-backups");
let backupReader = new BackupReader(currentBackupDir);

const rootDir = join(import.meta.dir, "../../");

Bun.serve({
  port: PORT,
  development: isCompiled ? false : { hmr: true, console: true },
  routes: {
    // ── Static assets ────────────────────────────────
    "/dist/app.css": {
      GET: () =>
        new Response(Bun.file(join(rootDir, "dist/app.css")), {
          headers: { "Content-Type": "text/css" },
        }),
    },
    "/src/shared/icon.svg": {
      GET: () =>
        new Response(Bun.file(join(rootDir, "src/shared/icon.svg")), {
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

    "/api/artifact": {
      GET: async (req: Request) => {
        try {
          const url = new URL(req.url);
          const cid = url.searchParams.get("cid");
          const name = url.searchParams.get("name");

          if (!cid || !name || cid.includes("..") || name.includes("..") || name.includes("/")) {
            return Response.json({ error: "Invalid parameters" }, { status: 400 });
          }

          const filePath = join(BRAIN_DIR, cid, name);
          const file = Bun.file(filePath);
          if (!(await file.exists())) {
            return Response.json({ error: "File not found" }, { status: 404 });
          }

          return new Response(file);
        } catch (err) {
          console.error("[GET /api/artifact]", err);
          return Response.json({ error: "Failed to read artifact" }, { status: 500 });
        }
      },
    },

    "/api/snapshots": {
      GET: async () => {
        try {
          const snapshots = await listBackups();
          return Response.json(snapshots);
        } catch (err) {
          console.error("[GET /api/snapshots]", err);
          return Response.json({ error: "Failed to list snapshots" }, { status: 500 });
        }
      },
    },

    "/api/snapshots/diff": {
      GET: async (req: Request) => {
        try {
          const url = new URL(req.url);
          const a = url.searchParams.get("a") ?? "current";
          const b = url.searchParams.get("b") ?? "current";
          const result = diffSnapshots(a, b);
          return Response.json(result);
        } catch (err) {
          console.error("[GET /api/snapshots/diff]", err);
          return Response.json({ error: "Failed to diff snapshots" }, { status: 500 });
        }
      },
    },

    // ── Backup directory config ──
    "/api/backups/config": {
      GET: () => Response.json({ directory: currentBackupDir }),
      POST: async (req: Request) => {
        try {
          const body = (await req.json()) as { directory?: string };
          if (!body.directory) {
            return Response.json({ error: "Missing 'directory' field" }, { status: 400 });
          }
          currentBackupDir = body.directory;
          backupReader = new BackupReader(currentBackupDir);
          console.log(`[Config] Backup directory changed to: ${currentBackupDir}`);
          return Response.json({ directory: currentBackupDir });
        } catch (err) {
          console.error("[POST /api/backups/config]", err);
          return Response.json({ error: "Failed to update config" }, { status: 500 });
        }
      },
    },

    // ── Backup Viewer API (wildcard — dynamic path params) ──
    "/api/backups": {
      GET: async (req: Request) => {
        const response = await handleBackupRoute(req, backupReader);
        return response ?? Response.json({ error: "Not found" }, { status: 404 });
      },
    },
    "/api/backups/*": {
      GET: async (req: Request) => {
        const response = await handleBackupRoute(req, backupReader);
        return response ?? Response.json({ error: "Not found" }, { status: 404 });
      },
    },

    // ── React SPA (catch-all) ────────────────────────
    "/*": app,
  },
});

console.log();
console.log("═══════════════════════════════════════════════");
console.log("  ⚡ Spectral — Bun Full-Stack");
console.log("═══════════════════════════════════════════════");
console.log();
console.log(`  App:  http://localhost:${PORT}`);
console.log(`  API:  http://localhost:${PORT}/api/*`);
console.log(`  HMR:  enabled`);
console.log(`  DB:   ${DB_PATH}`);
console.log(`  Brain: ${BRAIN_DIR}`);
console.log();
