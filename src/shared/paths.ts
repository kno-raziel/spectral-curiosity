/**
 * Cross-platform path constants for Antigravity state files.
 */

import { homedir, platform } from "node:os";
import { join } from "node:path";

function getDbPath(): string {
  const home = homedir();
  const os = platform();
  if (os === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "antigravity",
      "User",
      "globalStorage",
      "state.vscdb",
    );
  }
  if (os === "linux") {
    return join(home, ".config", "antigravity", "User", "globalStorage", "state.vscdb");
  }
  // Windows
  const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
  return join(appData, "antigravity", "User", "globalStorage", "state.vscdb");
}

function getGeminiDir(): string {
  return join(homedir(), ".gemini", "antigravity");
}

export const DB_PATH = getDbPath();
export const GEMINI_DIR = getGeminiDir();
export const BRAIN_DIR = join(GEMINI_DIR, "brain");
export const CONVERSATIONS_DIR = join(GEMINI_DIR, "conversations");
export const WORKSPACE_CONFIG_PATH = join(GEMINI_DIR, "spectral-workspaces.json");
