import * as vscode from "vscode";
import { SpectralPanel } from "./SpectralPanel";
import { SdkManager } from "./sdk/sdk-manager";

export function activate(context: vscode.ExtensionContext) {
  const openCommand = vscode.commands.registerCommand(
    "spectralCuriosity.open",
    () => {
      SpectralPanel.createOrShow(context.extensionUri);
    },
  );

  context.subscriptions.push(openCommand);

  // ── SDK Spike Command ──────────────────────────────────────────────
  const spikeCommand = vscode.commands.registerCommand(
    "spectralCuriosity.sdkSpike",
    async () => {
      const output = vscode.window.createOutputChannel("Spectral Curiosity");
      output.show(true);
      const log = (msg: string) => output.appendLine(msg);

      try {
        log("=== SDK Spike: Initializing ===");
        const sdkManager = await SdkManager.create(context, log);

        if (!sdkManager) {
          log("❌ SDK initialization failed — see logs above");
          vscode.window.showErrorMessage(
            "SDK Spike failed: could not initialize SDK",
          );
          return;
        }

        const { lsClient } = sdkManager;

        // ── List conversations ──
        log("\n=== listCascades() ===");
        const cascades = await lsClient.listCascades();
        const cascadeIds = Object.keys(cascades);
        log(`Found ${cascadeIds.length} conversations`);

        for (const id of cascadeIds) {
          const entry = cascades[id];
          log(`  ${id}: "${entry.summary}" (${entry.stepCount} steps)`);
        }

        // ── Test full trajectory retrieval ──
        const testCascadeId = cascadeIds[0];

        if (testCascadeId) {
          const entry = cascades[testCascadeId];
          log(`\nTarget: "${entry.summary}"`);
          log(`  cascadeId: ${testCascadeId}`);
          log(`  trajectoryId: ${entry.trajectoryId}`);

          // Get full trajectory
          log("\n--- getTrajectory() ---");
          try {
            const trajectory = await lsClient.getTrajectory(testCascadeId);
            const stepCount = trajectory.trajectory.steps.length;
            const size = JSON.stringify(trajectory).length;
            log(`✅ ${stepCount} steps, ${(size / 1024 / 1024).toFixed(1)} MB`);

            // Show step type summary
            const typeCounts = new Map<string, number>();
            for (const step of trajectory.trajectory.steps) {
              const short = step.type.replace("CORTEX_STEP_TYPE_", "");
              typeCounts.set(short, (typeCounts.get(short) ?? 0) + 1);
            }
            for (const [type, count] of typeCounts) {
              log(`  ${type}: ${count}`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`❌ getTrajectory failed: ${msg}`);
          }

          // Get artifact snapshots
          log("\n--- getArtifactSnapshots() ---");
          try {
            const snapshots =
              await lsClient.getArtifactSnapshots(testCascadeId);
            const artifacts = snapshots.artifactSnapshots ?? [];
            log(`✅ ${artifacts.length} artifacts`);
            for (const a of artifacts) {
              const hasContent = a.content ? ` (${a.content.length} chars)` : "";
              log(`  ${a.artifactName}${hasContent}`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`❌ getArtifactSnapshots failed: ${msg}`);
          }

          // Get generator metadata
          log("\n--- getGeneratorMetadata() ---");
          try {
            const meta = await lsClient.getGeneratorMetadata(testCascadeId);
            const invocations = meta.generatorMetadata.length;
            const totalInput = meta.generatorMetadata.reduce(
              (sum, m) => sum + parseInt(m.chatModel.usage.inputTokens || "0", 10),
              0,
            );
            const totalOutput = meta.generatorMetadata.reduce(
              (sum, m) =>
                sum + parseInt(m.chatModel.usage.outputTokens || "0", 10),
              0,
            );
            log(
              `✅ ${invocations} invocations, ${totalInput.toLocaleString()} input tokens, ${totalOutput.toLocaleString()} output tokens`,
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`❌ getGeneratorMetadata failed: ${msg}`);
          }
        }

        log("\n=== Spike Complete ===");
        vscode.window.showInformationMessage(
          "SDK Spike complete — check Output panel",
        );
        sdkManager.dispose();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log(`❌ Error: ${message}`);
        if (err instanceof Error && err.stack) {
          log(err.stack);
        }
        vscode.window.showErrorMessage(`SDK Spike failed: ${message}`);
      }
    },
  );

  context.subscriptions.push(spikeCommand);

  // Auto-dispose panel when extension deactivates
  if (SpectralPanel.currentPanel) {
    context.subscriptions.push(SpectralPanel.currentPanel);
  }
}

export function deactivate() {
  // Cleanup handled by disposables
}
