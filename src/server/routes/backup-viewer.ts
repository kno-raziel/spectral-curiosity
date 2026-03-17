/**
 * Backup Viewer API route handler.
 *
 * Since Bun.serve uses static route keys (no express-style :params),
 * this exports a single handler that matches URL patterns and delegates
 * to the BackupReader.
 */

import type { BackupReader } from "../../shared/backup-reader";

/**
 * Handle backup viewer API requests.
 * Returns a Response if the URL matches a backup route, or null to pass through.
 *
 * Routes:
 *   GET /api/backups                              → List backups
 *   GET /api/backups/:id                          → Get manifest
 *   GET /api/backups/:id/conversations            → List conversations
 *   GET /api/backups/:id/conversations/:convId    → Full trajectory
 *   GET /api/backups/:id/conversations/:convId/markdown → Markdown export
 *   GET /api/backups/:id/search?q=term            → Full-text search
 */
export async function handleBackupRoute(
  req: Request,
  reader: BackupReader | null,
): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Only handle GET requests to /api/backups/*
  if (req.method !== "GET" || !path.startsWith("/api/backups")) return null;

  if (!reader) {
    return Response.json(
      {
        error: "Backup viewer not configured. Set SPECTRAL_BACKUP_DIR or pass --backup-dir.",
      },
      { status: 503 },
    );
  }

  try {
    // GET /api/backups
    if (path === "/api/backups") {
      const backups = await reader.listBackups();
      return Response.json(backups);
    }

    // Match /api/backups/:id[/...]
    const segments = path.replace("/api/backups/", "").split("/");
    const backupId = decodeURIComponent(segments[0]);

    if (!backupId) return null;

    // GET /api/backups/:id
    if (segments.length === 1) {
      const manifest = await reader.getManifest(backupId);
      return Response.json(manifest);
    }

    // GET /api/backups/:id/search?q=term
    if (segments[1] === "search") {
      const query = url.searchParams.get("q") ?? "";
      const results = await reader.search(backupId, query);
      return Response.json(results);
    }

    // GET /api/backups/:id/conversations
    if (segments[1] === "conversations" && segments.length === 2) {
      const conversations = await reader.listConversations(backupId);
      return Response.json(conversations);
    }

    // GET /api/backups/:id/conversations/:convId
    if (segments[1] === "conversations" && segments.length === 3) {
      const convId = decodeURIComponent(segments[2]);
      const trajectory = await reader.getTrajectory(backupId, convId);
      return Response.json(trajectory);
    }

    // GET /api/backups/:id/conversations/:convId/markdown
    if (segments[1] === "conversations" && segments.length === 4 && segments[3] === "markdown") {
      const convId = decodeURIComponent(segments[2]);
      const md = await reader.getMarkdown(backupId, convId);
      return new Response(md, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Backup Viewer] ${path}:`, message);

    // File not found → 404
    if (message.includes("ENOENT") || message.includes("no such file")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
