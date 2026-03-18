/**
 * Backup size estimator — scans source directories to estimate backup size
 * per category before running a backup.
 *
 * Uses `fs.statSync` (not `lstatSync`) to follow symlinks, matching
 * the behavior of `cpSync({ dereference: true })` in BackupEngine.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BRAIN_DIR, CONVERSATIONS_DIR, GEMINI_DIR } from "../../shared/paths";

export interface CategoryEstimate {
  label: string;
  emoji: string;
  settingKey: string;
  sizeBytes: number;
  count?: number;
}

export interface BackupEstimate {
  categories: CategoryEstimate[];
  totalBytes: number;
}

/**
 * Recursively compute the total size of a directory (follows symlinks).
 * Returns 0 if the directory doesn't exist.
 */
function dirSizeBytes(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let total = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      try {
        const stat = statSync(fullPath); // follows symlinks
        if (stat.isDirectory()) {
          total += dirSizeBytes(fullPath);
        } else if (stat.isFile()) {
          total += stat.size;
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return total;
}

/** Count entries in a directory (non-recursive, top-level only). */
function countEntries(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath).length;
  } catch {
    return 0;
  }
}

/**
 * Estimate the backup size for each category based on source directories.
 */
export function estimateBackupSize(): BackupEstimate {
  const categories: CategoryEstimate[] = [];

  // Conversations — scan protobuf files in conversations dir
  const convSize = dirSizeBytes(CONVERSATIONS_DIR);
  const convCount = countEntries(CONVERSATIONS_DIR);
  categories.push({
    label: "Conversations",
    emoji: "💬",
    settingKey: "_conversations", // always included, no toggle
    sizeBytes: convSize,
    count: convCount,
  });

  // Brain
  const brainSize = dirSizeBytes(BRAIN_DIR);
  categories.push({
    label: "Brain",
    emoji: "🧠",
    settingKey: "includeBrain",
    sizeBytes: brainSize,
  });

  // Knowledge
  const knowledgeDir = join(GEMINI_DIR, "knowledge");
  const knowledgeSize = dirSizeBytes(knowledgeDir);
  categories.push({
    label: "Knowledge",
    emoji: "📚",
    settingKey: "includeKnowledge",
    sizeBytes: knowledgeSize,
  });

  // Skills + Workflows
  const skillsDir = join(GEMINI_DIR, "skills");
  const workflowsDir = join(GEMINI_DIR, "workflows");
  const skillsSize = dirSizeBytes(skillsDir) + dirSizeBytes(workflowsDir);
  categories.push({
    label: "Skills & Workflows",
    emoji: "🛠️",
    settingKey: "includeSkills",
    sizeBytes: skillsSize,
  });

  const totalBytes = categories.reduce((sum, c) => sum + c.sizeBytes, 0);

  return { categories, totalBytes };
}

/** Format bytes as human-readable string (e.g. "3.8 GB") */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}
