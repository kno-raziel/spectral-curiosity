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
 *   GET /api/backups                                         → List backups
 *   GET /api/backups/:id                                     → Get manifest
 *   GET /api/backups/:id/conversations                       → List conversations
 *   GET /api/backups/:id/conversations/:convId               → Full trajectory
 *   GET /api/backups/:id/conversations/:convId/markdown      → Markdown export
 *   GET /api/backups/:id/search?q=term                       → Full-text search
 *   GET /api/backups/:id/brain/:convId/tree                  → Brain file tree
 *   GET /api/backups/:id/brain/:convId/file?path=...         → Serve brain file
 *   GET /api/backups/:id/knowledge                           → Knowledge topics list
 *   GET /api/backups/:id/knowledge/:topicId/artifacts/:file  → Knowledge artifact
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

    // ── Conversations ──────────────────────────────────────────────────

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

    // ── Brain Explorer ──────────────────────────────────────────────────

    // GET /api/backups/:id/brain/:convId/tree
    if (segments[1] === "brain" && segments.length === 4 && segments[3] === "tree") {
      const convId = decodeURIComponent(segments[2]);
      const tree = await reader.getBrainTree(backupId, convId);
      return Response.json(tree);
    }

    // GET /api/backups/:id/brain/:convId/file?path=relative/path.png
    if (segments[1] === "brain" && segments.length === 4 && segments[3] === "file") {
      const convId = decodeURIComponent(segments[2]);
      const filePath = url.searchParams.get("path") ?? "";
      if (!filePath) {
        return Response.json({ error: "Missing ?path= parameter" }, { status: 400 });
      }
      const result = await reader.readBrainFile(backupId, convId, filePath);
      return new Response(Bun.file(result.path), {
        headers: {
          "Content-Type": result.mimeType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // ── Knowledge Base ──────────────────────────────────────────────────

    // GET /api/backups/:id/knowledge
    if (segments[1] === "knowledge" && segments.length === 2) {
      const topics = await reader.getKnowledgeTopics(backupId);
      return Response.json(topics);
    }

    // GET /api/backups/:id/knowledge/:topicId/artifacts/...nested/file.md
    if (segments[1] === "knowledge" && segments.length >= 5 && segments[3] === "artifacts") {
      const topicId = decodeURIComponent(segments[2]);
      const nestedPath = segments.slice(4).map(decodeURIComponent).join("/");
      const content = await reader.readKnowledgeArtifact(backupId, topicId, nestedPath);
      return new Response(content, {
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
