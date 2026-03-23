#!/usr/bin/env bun
/**
 * Bun 1.3 full-stack server for Spectral
 *
 * Single process: API routes + React SPA with HMR.
 * No Vite, no CORS, no concurrently.
 *
 * Supports two runtime modes:
 * - Dev mode (cloned repo): imports index.html for HMR
 * - Bunx mode (npm install): serves pre-built dist/ files
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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

// Detect bunx/npx mode: running from inside node_modules
const isBunxMode = import.meta.dir.includes("node_modules");

let currentBackupDir = process.env.SPECTRAL_BACKUP_DIR || join(homedir(), "antigravity-backups");
let backupReader = new BackupReader(currentBackupDir);

const rootDir = join(import.meta.dir, "../../");
const distDir = join(rootDir, "dist");

// ── SPA handler ─────────────────────────────────────────
// In dev mode, import the HTML file for HMR support.
// In bunx mode, we serve pre-built dist/ files instead.
// biome-ignore lint/suspicious/noExplicitAny: Bun HTML import returns an opaque route handler
let spaHandler: any;

if (!isBunxMode && !isCompiled) {
  spaHandler = (await import("../../index.html")).default;
} else {
  // Bunx/compiled mode: serve pre-built dist/ files
  const distIndexHtml = Bun.file(join(distDir, "index.html"));

  spaHandler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Try to serve a dist/ file matching the request path
    if (pathname !== "/") {
      const filename = pathname.startsWith("/") ? pathname.slice(1) : pathname;
      const filepath = join(distDir, filename);
      if (existsSync(filepath)) {
        const ext = filename.split(".").pop() ?? "";
        const mimeTypes: Record<string, string> = {
          js: "text/javascript",
          css: "text/css",
          html: "text/html",
          svg: "image/svg+xml",
          png: "image/png",
          woff2: "font/woff2",
        };
        return new Response(Bun.file(filepath), {
          headers: { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" },
        });
      }
    }

    // Fallback: serve index.html for SPA routing
    return new Response(distIndexHtml, {
      headers: { "Content-Type": "text/html" },
    });
  };
}

// ── API Routes ──────────────────────────────────────────

Bun.serve({
  port: PORT,
  development: isBunxMode || isCompiled ? false : { hmr: true, console: true },
  routes: {
    // ── Static assets (dev mode only — bunx handles via spaHandler) ──
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
          return Response.json({ workspaces, conversations });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },

    "/api/workspaces": {
      GET: async () => {
        try {
          const workspaces = await loadWorkspaces();
          return Response.json(workspaces);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },

    "/api/save": {
      POST: async (req: Request) => {
        try {
          const body = (await req.json()) as {
            assignments: Record<string, string>;
            renames: Record<string, string>;
          };
          const result = await saveAssignments(body.assignments, body.renames);
          return Response.json(result);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },

    "/api/paths": {
      GET: () => {
        return Response.json({
          dbPath: DB_PATH,
          conversationsDir: CONVERSATIONS_DIR,
          brainDir: BRAIN_DIR,
        });
      },
    },

    "/api/artifact": {
      GET: async (req: Request) => {
        const url = new URL(req.url);

        // Support both ?path= (direct) and ?cid=&name= (composed)
        let filePath = url.searchParams.get("path");
        if (!filePath) {
          const cid = url.searchParams.get("cid");
          const name = url.searchParams.get("name");
          if (cid && name) {
            filePath = join(BRAIN_DIR, cid, name);
          }
        }

        if (!filePath)
          return Response.json({ error: "Missing ?path= or ?cid=&name=" }, { status: 400 });

        // Security: ensure path is under BRAIN_DIR or CONVERSATIONS_DIR
        const resolved = join(filePath);
        if (
          !resolved.startsWith(BRAIN_DIR) &&
          !resolved.startsWith(CONVERSATIONS_DIR) &&
          !resolved.startsWith(currentBackupDir)
        ) {
          return Response.json({ error: "Forbidden path" }, { status: 403 });
        }

        const file = Bun.file(resolved);
        if (!(await file.exists()))
          return Response.json({ error: "Not found" }, { status: 404 });

        return new Response(file);
      },
    },

    "/api/snapshots": {
      GET: async () => {
        try {
          const snapshots = await listBackups(CONVERSATIONS_DIR);
          return Response.json(snapshots);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },

    "/api/snapshots/diff": {
      GET: async (req: Request) => {
        try {
          const url = new URL(req.url);
          const a = url.searchParams.get("a");
          const b = url.searchParams.get("b") ?? "current";
          if (!a) return Response.json({ error: "Missing ?a=" }, { status: 400 });
          const result = await diffSnapshots(CONVERSATIONS_DIR, a, b);
          return Response.json(result);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },

    // ── Backup directory config ──
    "/api/backups/config": {
      GET: () => Response.json({ backupDir: currentBackupDir }),
      POST: async (req: Request) => {
        try {
          const body = (await req.json()) as { backupDir: string };
          if (!body.backupDir)
            return Response.json({ error: "Missing backupDir" }, { status: 400 });

          // Validate path exists and contains backup-like files
          const entries = await readdir(body.backupDir).catch(() => null);
          if (!entries)
            return Response.json({ error: "Directory not found" }, { status: 404 });

          currentBackupDir = body.backupDir;
          backupReader = new BackupReader(currentBackupDir);
          return Response.json({ backupDir: currentBackupDir });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
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
    "/*": spaHandler,
  },
});

const mode = isBunxMode ? "bunx" : isCompiled ? "compiled" : "dev";
console.log();
console.log("═══════════════════════════════════════════════");
console.log("  ⚡ Spectral — Bun Full-Stack");
console.log("═══════════════════════════════════════════════");
console.log();
console.log(`  App:  http://localhost:${PORT}`);
console.log(`  API:  http://localhost:${PORT}/api/*`);
console.log(`  Mode: ${mode}`);
console.log(`  DB:   ${DB_PATH}`);
console.log(`  Brain: ${BRAIN_DIR}`);
console.log();
