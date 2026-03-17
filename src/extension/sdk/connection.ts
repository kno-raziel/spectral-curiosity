/**
 * macOS-compatible Language Server connection discovery.
 *
 * The SDK's built-in Phase 2 discovery uses `ss` / `netstat -tlnp` which are
 * Linux-only. On macOS we use `lsof` to find the LS process's listening ports,
 * then exclude `extension_server_port` to identify the ConnectRPC port.
 */

import { execSync } from "node:child_process";
import type * as vscode from "vscode";
import type { ConnectionInfo } from "./ls-types";

/**
 * Discover the Language Server's ConnectRPC port and CSRF token.
 *
 * @returns Connection info or `null` if discovery fails.
 */
export function discoverLsConnection(
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
  log: (msg: string) => void,
): ConnectionInfo | null {
  try {
    // Phase 1: Find LS process via ps
    const psResult = execSync(
      "ps -eo pid,args 2>/dev/null | grep language_server | grep csrf_token | grep -v grep",
      { encoding: "utf8", timeout: 5000 },
    );
    const lines = psResult.split("\n").filter((l: string) => l.trim().length > 0);
    if (lines.length === 0) {
      log("⚠️ No LS processes found");
      return null;
    }

    // Try to match the workspace (heuristic: folder name in CLI args)
    let bestLine = lines[0];
    if (workspaceFolders && workspaceFolders.length > 0) {
      const hint = workspaceFolders[0].uri.fsPath
        .replace(/\\/g, "/")
        .split("/")
        .slice(-2)
        .join("_")
        .replace(/[-.\s]/g, "_")
        .toLowerCase();
      for (const line of lines) {
        if (line.includes(hint)) {
          bestLine = line;
          break;
        }
      }
    }

    const pid = parseInt(bestLine.trim().split(/\s+/)[0], 10);
    const csrfMatch = bestLine.match(/--csrf_token[=\s]+([^\s"]+)/);
    const extPortMatch = bestLine.match(/--extension_server_port[=\s]+(\d+)/);

    if (!csrfMatch?.[1] || isNaN(pid)) {
      log("⚠️ Could not extract PID or CSRF from LS process");
      return null;
    }

    const csrfToken = csrfMatch[1];
    const extPort = extPortMatch?.[1] ? parseInt(extPortMatch[1], 10) : 0;

    log(`LS process: PID=${pid}, extPort=${extPort}`);

    // Phase 2: Use lsof to find ConnectRPC port
    try {
      const lsofResult = execSync(
        `lsof -iTCP -sTCP:LISTEN -a -p ${pid} -n -P 2>/dev/null | grep '127.0.0.1'`,
        { encoding: "utf8", timeout: 5000 },
      );

      const portMatches = [...lsofResult.matchAll(/127\.0\.0\.1:(\d+)/g)];
      const ports = portMatches.map((m) => parseInt(m[1], 10)).filter((p) => p !== extPort);

      log(`Candidate ConnectRPC ports (excl extPort ${extPort}): ${ports.join(", ")}`);

      if (ports.length > 0) {
        return { port: ports[0], csrfToken };
      }
    } catch {
      log("⚠️ lsof failed — falling back to extension_server_port");
    }

    // Fallback
    if (extPort) {
      return { port: extPort, csrfToken };
    }

    return null;
  } catch {
    log("❌ LS process discovery failed");
    return null;
  }
}
