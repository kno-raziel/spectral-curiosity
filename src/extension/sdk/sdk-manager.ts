/**
 * SDK lifecycle manager.
 *
 * Handles AntigravitySDK initialization, macOS connection discovery,
 * and provides typed access to the Language Server via `LsClient`.
 *
 * Designed as an **optional enhancement** — if the LS is unavailable
 * the extension degrades gracefully.
 */

import type * as vscode from "vscode";
import { AntigravitySDK } from "antigravity-sdk";
import { discoverLsConnection } from "./connection";
import { LsClient } from "./ls-client";

export class SdkManager implements vscode.Disposable {
  readonly lsClient: LsClient;
  readonly version: string;

  private constructor(
    private readonly sdk: AntigravitySDK,
    lsClient: LsClient,
    version: string,
  ) {
    this.lsClient = lsClient;
    this.version = version;
  }

  /**
   * Create and initialize the SDK manager.
   *
   * @returns `SdkManager` if initialization succeeds, `null` otherwise.
   *          The extension should continue to work without SDK features when null.
   */
  static async create(
    context: vscode.ExtensionContext,
    log: (msg: string) => void,
  ): Promise<SdkManager | null> {
    try {
      const sdk = new AntigravitySDK(context);
      await sdk.initialize();

      log(`SDK initialized (v${sdk.version})`);
      log(
        `  LS ready: ${sdk.ls.isReady}, port: ${sdk.ls.port}, CSRF: ${sdk.ls.hasCsrfToken}`,
      );

      // macOS: SDK's Phase 2 discovery uses Linux-only ss/netstat
      if (process.platform === "darwin") {
        log("macOS detected — running manual port discovery via lsof");
        const conn = discoverLsConnection(
          (await import("vscode")).workspace.workspaceFolders,
          log,
        );

        if (conn) {
          // Try HTTPS first (ConnectRPC default), fall back to HTTP
          sdk.ls.setConnection(conn.port, conn.csrfToken, true);
          try {
            await sdk.ls.getUserStatus();
            log(`✅ Connected via HTTPS on port ${conn.port}`);
          } catch {
            log("HTTPS failed, trying HTTP...");
            sdk.ls.setConnection(conn.port, conn.csrfToken, false);
            try {
              await sdk.ls.getUserStatus();
              log(`✅ Connected via HTTP on port ${conn.port}`);
            } catch (httpErr: unknown) {
              const msg =
                httpErr instanceof Error ? httpErr.message : String(httpErr);
              log(`❌ HTTP also failed: ${msg}`);
              return null;
            }
          }
        } else {
          log("⚠️ Could not discover LS connection — SDK features disabled");
          return null;
        }
      }

      const lsClient = new LsClient(sdk);
      return new SdkManager(sdk, lsClient, sdk.version);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`SDK initialization failed: ${msg}`);
      return null;
    }
  }

  dispose(): void {
    // SDK doesn't have a dispose method, but future cleanup goes here
  }
}
