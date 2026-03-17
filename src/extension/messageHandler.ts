/**
 * Message router — maps webview method calls to shared module functions.
 *
 * Single entry point for all webview → extension host communication.
 * Initializes the Node.js adapter on first import.
 */

import { saveAssignments } from "../shared/assignments";
import { diffSnapshots, listBackups } from "../shared/backups";
import { loadConversations } from "../shared/conversations";
import { BRAIN_DIR, CONVERSATIONS_DIR, DB_PATH } from "../shared/paths";
import type { SavePayload } from "../shared/types";
import { loadWorkspaces } from "../shared/workspaces";
import { initNodeAdapters } from "./adapter";

// Initialize Node.js adapters on module load
initNodeAdapters();

type MessageMethod =
  | "getConversations"
  | "getWorkspaces"
  | "save"
  | "getPaths"
  | "getBackups"
  | "diffBackups";

/** Dispatch a webview message to the appropriate shared function. */
export async function handleMessage(method: string, params?: unknown): Promise<unknown> {
  switch (method as MessageMethod) {
    case "getConversations": {
      const workspaces = await loadWorkspaces();
      return loadConversations(workspaces);
    }

    case "getWorkspaces":
      return loadWorkspaces();

    case "save": {
      const payload = params as SavePayload;
      const workspaces = await loadWorkspaces();
      return saveAssignments(payload, workspaces);
    }

    case "getPaths":
      return { db: DB_PATH, brain: BRAIN_DIR, conversations: CONVERSATIONS_DIR };

    case "getBackups":
      return listBackups();

    case "diffBackups": {
      const { a, b } = params as { a: string; b: string };
      return diffSnapshots(a, b);
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}
