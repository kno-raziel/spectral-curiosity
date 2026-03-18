import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

import { SpectralPanel } from "./SpectralPanel";
import { BackupEngine } from "./sdk/backup-engine";
import { estimateBackupSize, formatBytes } from "./sdk/backup-estimator";
import { BackupScheduler, type BackupSchedulerState } from "./sdk/backup-scheduler";
import { SdkManager } from "./sdk/sdk-manager";

export function activate(context: vscode.ExtensionContext) {
  const openCommand = vscode.commands.registerCommand("spectral.open", () => {
    SpectralPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(openCommand);

  // ── Backup Now Command ─────────────────────────────────────────────
  const backupCommand = vscode.commands.registerCommand("spectral.backupNow", async () => {
    const output = vscode.window.createOutputChannel("Spectral — Backup");
    output.show(true);
    const log = (msg: string) => output.appendLine(msg);

    // Get or ask for backup directory
    const config = vscode.workspace.getConfiguration("spectral.backup");
    let backupDir = config.get<string>("path");

    if (!backupDir) {
      const defaultUri = vscode.Uri.file(join(homedir(), "antigravity-backups"));
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri,
        openLabel: "Select Backup Destination",
        title: "Where should Spectral save backups?",
      });

      if (!uri || uri.length === 0) {
        log("Backup cancelled: no destination selected.");
        return;
      }

      backupDir = uri[0].fsPath;

      // Ask if they want to save this path
      const saveChoice = await vscode.window.showInformationMessage(
        "Save this backup location for future backups?",
        "Yes",
        "No",
      );
      if (saveChoice === "Yes") {
        await config.update("path", backupDir, vscode.ConfigurationTarget.Global);
        log(`Saved backup path to settings: ${backupDir}`);
      }
    }

    log(`Target directory: ${backupDir}`);
    BackupEngine.cleanIncomplete(backupDir, log);

    // Initialize SDK
    const sdkManager = await SdkManager.create(context, log);
    if (!sdkManager) {
      vscode.window.showErrorMessage(
        "Backup failed: could not connect to Antigravity Language Server",
      );
      return;
    }

    const strategy =
      config.get<string>("strategy") === "incremental"
        ? ("incremental" as const)
        : ("full" as const);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Spectral: Backup",
        cancellable: false,
      },
      async (progress) => {
        try {
          const engine = new BackupEngine(sdkManager.lsClient, {
            backupDir,
            strategy,
            maxBackups: config.get<number>("maxBackups") ?? 10,
            includeBrain: config.get<boolean>("includeBrain") ?? true,
            includeKnowledge: config.get<boolean>("includeKnowledge") ?? true,
            includeSkills: config.get<boolean>("includeSkills") ?? true,
            includeTokenMetadata: config.get<boolean>("includeTokenMetadata") ?? false,
            autoBackupMode: false,
            log,
            onProgress: (p) => {
              const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
              progress.report({
                increment: 0,
                message: `${phaseLabel(p.phase)} ${p.label} (${pct}%)`,
              });
            },
          });

          const result = await engine.run();

          if (result.success) {
            const summary = [
              `✅ Backup complete: ${result.exportedCount} conversations`,
              result.failedCount > 0 ? `, ${result.failedCount} failed` : "",
              result.skippedCount > 0 ? `, ${result.skippedCount} skipped` : "",
              ` (${(result.totalSizeBytes / 1024 / 1024).toFixed(1)} MB`,
              ` in ${(result.durationMs / 1000).toFixed(1)}s)`,
            ].join("");

            vscode.window.showInformationMessage(summary);
          } else {
            vscode.window.showErrorMessage("Backup failed — check Output panel");
          }
        } finally {
          sdkManager.dispose();
        }
      },
    );
  });

  context.subscriptions.push(backupCommand);

  // ── Open Backup Folder Command ─────────────────────────────────────
  const openBackupFolderCommand = vscode.commands.registerCommand(
    "spectral.openBackupFolder",
    async () => {
      const config = vscode.workspace.getConfiguration("spectral.backup");
      const backupDir = config.get<string>("path") || join(homedir(), "antigravity-backups");
      const uri = vscode.Uri.file(backupDir);
      await vscode.env.openExternal(uri);
    },
  );

  context.subscriptions.push(openBackupFolderCommand);

  // ── Backup Scheduler ───────────────────────────────────────────────
  const scheduler = new BackupScheduler(context);
  context.subscriptions.push(scheduler);

  // ── Status Bar ─────────────────────────────────────────────────────
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBarItem.command = "spectral.configureBackup";
  updateStatusBar(statusBarItem, scheduler.state);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const stateWatcher = scheduler.onDidChangeState((state) => {
    updateStatusBar(statusBarItem, state);
  });
  context.subscriptions.push(stateWatcher);

  // ── Configure Backup Command (QuickPick + Size Estimates) ──────────
  const configureBackupCommand = vscode.commands.registerCommand(
    "spectral.configureBackup",
    async () => {
      const config = vscode.workspace.getConfiguration("spectral.backup");

      // Compute estimates
      const estimate = estimateBackupSize();

      // Build QuickPick items
      const items: (vscode.QuickPickItem & { settingKey?: string })[] = estimate.categories.map(
        (cat) => {
          const size = formatBytes(cat.sizeBytes);
          const countLabel = cat.count !== undefined ? ` (${cat.count})` : "";
          const isConversations = cat.settingKey === "_conversations";

          return {
            label: `${cat.emoji} ${cat.label}${countLabel}`,
            description: size,
            picked: isConversations ? true : (config.get<boolean>(cat.settingKey) ?? true),
            settingKey: isConversations ? undefined : cat.settingKey,
          };
        },
      );

      const quickPick = vscode.window.createQuickPick<
        vscode.QuickPickItem & { settingKey?: string }
      >();
      quickPick.title = `📦 Backup Configuration — Estimated total: ${formatBytes(estimate.totalBytes)}`;
      quickPick.placeholder = "Select categories → Enter → Confirm backup";
      quickPick.canSelectMany = true;
      quickPick.items = items;
      quickPick.selectedItems = items.filter((i) => i.picked);

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems;
        quickPick.hide();

        // Persist selections to settings
        for (const item of items) {
          if (item.settingKey) {
            const isSelected = selected.some((s) => s.label === item.label);
            await config.update(item.settingKey, isSelected, vscode.ConfigurationTarget.Global);
          }
        }

        // Compute selected total for confirmation
        const selectedTotal = estimate.categories
          .filter((cat) => {
            if (cat.settingKey === "_conversations") return true;
            return selected.some((s) => s.label.includes(cat.label));
          })
          .reduce((sum, c) => sum + c.sizeBytes, 0);

        // 2-step confirmation
        const choice = await vscode.window.showInformationMessage(
          `Start backup? Estimated size: ~${formatBytes(selectedTotal)}`,
          { modal: false },
          "Start Backup",
        );

        if (choice === "Start Backup") {
          await vscode.commands.executeCommand("spectral.backupNow");
        }
      });

      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    },
  );
  context.subscriptions.push(configureBackupCommand);

  // ── SDK Spike Command ──────────────────────────────────────────────
  const spikeCommand = vscode.commands.registerCommand("spectral.sdkSpike", async () => {
    const output = vscode.window.createOutputChannel("Spectral");
    output.show(true);
    const log = (msg: string) => output.appendLine(msg);

    try {
      log("=== SDK Spike: Initializing ===");
      const sdkManager = await SdkManager.create(context, log);

      if (!sdkManager) {
        log("❌ SDK initialization failed — see logs above");
        vscode.window.showErrorMessage("SDK Spike failed: could not initialize SDK");
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
          const steps = trajectory.trajectory.steps ?? [];
          const stepCount = steps.length;
          const size = JSON.stringify(trajectory).length;
          log(`✅ ${stepCount} steps, ${(size / 1024 / 1024).toFixed(1)} MB`);

          // Show step type summary
          const typeCounts = new Map<string, number>();
          for (const step of steps) {
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
          const snapshots = await lsClient.getArtifactSnapshots(testCascadeId);
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
            (sum, m) => sum + parseInt(m.chatModel.usage.outputTokens || "0", 10),
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
      vscode.window.showInformationMessage("SDK Spike complete — check Output panel");
      sdkManager.dispose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log(`❌ Error: ${message}`);
      if (err instanceof Error && err.stack) {
        log(err.stack);
      }
      vscode.window.showErrorMessage(`SDK Spike failed: ${message}`);
    }
  });

  context.subscriptions.push(spikeCommand);

  // Auto-dispose panel when extension deactivates
  if (SpectralPanel.currentPanel) {
    context.subscriptions.push(SpectralPanel.currentPanel);
  }
}

export function deactivate() {
  // Cleanup handled by disposables
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function phaseLabel(phase: string): string {
  switch (phase) {
    case "listing":
      return "📋";
    case "exporting":
      return "💾";
    case "copying-brain":
      return "🧠";
    case "copying-knowledge":
      return "📚";
    case "copying-skills":
      return "🛠️";
    case "finalizing":
      return "✅";
    default:
      return "⏳";
  }
}

function updateStatusBar(item: vscode.StatusBarItem, state: BackupSchedulerState): void {
  if (state.backupInProgress) {
    item.text = "$(sync~spin) Backup…";
    item.tooltip = "Spectral: Backup in progress";
    return;
  }

  if (state.lastBackupFailed) {
    item.text = "$(warning) Backup";
    item.tooltip = `Spectral: Last backup failed\n${state.lastBackupSummary ?? ""}`;
    return;
  }

  // Compute estimated size for status bar
  let sizeLabel = "";
  try {
    const estimate = estimateBackupSize();
    sizeLabel = ` ~${formatBytes(estimate.totalBytes)}`;
  } catch {
    // Ignore estimation errors
  }

  if (state.lastBackupAt) {
    const time = new Date(state.lastBackupAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    item.text = `$(cloud-upload) ${time}${sizeLabel}`;
    item.tooltip = `Spectral: Last backup at ${time}\n${state.lastBackupSummary ?? ""}\nEstimated source size:${sizeLabel}\nClick to configure & backup`;
    return;
  }

  if (state.running) {
    item.text = `$(cloud-upload) Auto${sizeLabel}`;
    item.tooltip = `Spectral: Auto-backup enabled\nEstimated source size:${sizeLabel}\nClick to configure & backup`;
    return;
  }

  // Scheduler not running, no backup history
  item.text = `$(cloud-upload) Backup${sizeLabel}`;
  item.tooltip = `Spectral: Estimated source size:${sizeLabel}\nClick to configure & backup`;
}
