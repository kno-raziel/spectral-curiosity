/**
 * Backup Scheduler — interval-based automated backup.
 *
 * Runs a full backup at a configurable interval (default: 60 min).
 * Scheduled backups always overwrite a single fixed directory
 * (`spectral-auto-backup/`) to avoid unbounded disk usage.
 * On-demand backups (`Backup Now`) are handled separately with
 * timestamped directories and rotation.
 *
 * Implements `vscode.Disposable` for clean lifecycle management.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

import { BackupEngine } from "./backup-engine";
import { SdkManager } from "./sdk-manager";

/** Minimum interval allowed (minutes) */
const MIN_INTERVAL_MINUTES = 5;

export interface BackupSchedulerState {
  /** Whether the scheduler is currently running */
  running: boolean;
  /** Whether a backup is currently in progress */
  backupInProgress: boolean;
  /** ISO timestamp of last successful backup */
  lastBackupAt: string | null;
  /** Summary of last backup result */
  lastBackupSummary: string | null;
  /** Whether last backup failed */
  lastBackupFailed: boolean;
}

export class BackupScheduler implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private backupInProgress = false;
  private lastBackupAt: string | null = null;
  private lastBackupSummary: string | null = null;
  private lastBackupFailed = false;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly output: vscode.OutputChannel;

  private readonly _onDidChangeState = new vscode.EventEmitter<BackupSchedulerState>();
  /** Fires when scheduler state changes (for status bar updates) */
  readonly onDidChangeState = this._onDidChangeState.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.output = vscode.window.createOutputChannel("Spectral — Auto Backup");

    // Watch for settings changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("spectral.backup.enabled") ||
        e.affectsConfiguration("spectral.backup.intervalMinutes")
      ) {
        this.reconcile();
      }
    });
    this.disposables.push(configWatcher, this._onDidChangeState, this.output);

    // Start if already enabled
    this.reconcile();
  }

  /** Current scheduler state */
  get state(): BackupSchedulerState {
    return {
      running: this.running,
      backupInProgress: this.backupInProgress,
      lastBackupAt: this.lastBackupAt,
      lastBackupSummary: this.lastBackupSummary,
      lastBackupFailed: this.lastBackupFailed,
    };
  }

  /**
   * Reconcile the scheduler state with current settings.
   * Starts or stops the timer as needed.
   */
  private reconcile(): void {
    const config = vscode.workspace.getConfiguration("spectral.backup");
    const enabled = config.get<boolean>("enabled") ?? false;
    const intervalMinutes = Math.max(
      config.get<number>("intervalMinutes") ?? 60,
      MIN_INTERVAL_MINUTES,
    );

    if (enabled && !this.running) {
      this.start(intervalMinutes);
    } else if (enabled && this.running) {
      // Interval may have changed — restart
      this.stop();
      this.start(intervalMinutes);
    } else if (!enabled && this.running) {
      this.stop();
    }
  }

  private start(intervalMinutes: number): void {
    const intervalMs = intervalMinutes * 60 * 1000;
    this.log(`Scheduler started — interval: ${intervalMinutes} min`);
    this.running = true;
    this.fireStateChange();

    this.timer = setInterval(() => {
      void this.runAutoBackup();
    }, intervalMs);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.log("Scheduler stopped");
    this.fireStateChange();
  }

  /**
   * Run a single auto-backup cycle.
   * Debounced: if a backup is already in progress, skip.
   */
  async runAutoBackup(): Promise<void> {
    if (this.backupInProgress) {
      this.log("Skipping scheduled backup — one is already in progress");
      return;
    }

    const config = vscode.workspace.getConfiguration("spectral.backup");
    const backupDir = config.get<string>("path") || join(homedir(), "antigravity-backups");

    this.backupInProgress = true;
    this.fireStateChange();

    let sdkManager: SdkManager | null = null;

    try {
      this.log("Auto-backup starting...");
      BackupEngine.cleanIncomplete(backupDir, (msg) => this.log(msg));

      sdkManager = await SdkManager.create(this.context, (msg) => this.log(msg));
      if (!sdkManager) {
        this.log("❌ Auto-backup failed: could not connect to Antigravity Language Server");
        this.lastBackupFailed = true;
        this.lastBackupSummary = "Failed: LS connection unavailable";
        return;
      }

      const strategy =
        config.get<string>("strategy") === "incremental"
          ? ("incremental" as const)
          : ("full" as const);

      const engine = new BackupEngine(sdkManager.lsClient, {
        backupDir,
        strategy,
        maxBackups: 0, // irrelevant in auto mode
        includeBrain: config.get<boolean>("includeBrain") ?? true,
        includeKnowledge: config.get<boolean>("includeKnowledge") ?? true,
        includeSkills: config.get<boolean>("includeSkills") ?? true,
        includeTokenMetadata: config.get<boolean>("includeTokenMetadata") ?? false,
        autoBackupMode: true,
        log: (msg) => this.log(msg),
      });

      const result = await engine.run();

      if (result.success) {
        this.lastBackupAt = new Date().toISOString();
        this.lastBackupFailed = false;
        this.lastBackupSummary = [
          `${result.exportedCount} conversations`,
          result.failedCount > 0 ? `${result.failedCount} failed` : "",
          `${(result.totalSizeBytes / 1024 / 1024).toFixed(1)} MB`,
          `${(result.durationMs / 1000).toFixed(1)}s`,
        ]
          .filter(Boolean)
          .join(", ");
        this.log(`✅ Auto-backup complete: ${this.lastBackupSummary}`);
      } else {
        this.lastBackupFailed = true;
        this.lastBackupSummary = "Backup finished with errors";
        this.log("⚠️ Auto-backup completed with errors — check output");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastBackupFailed = true;
      this.lastBackupSummary = `Error: ${msg}`;
      this.log(`❌ Auto-backup error: ${msg}`);
    } finally {
      sdkManager?.dispose();
      this.backupInProgress = false;
      this.fireStateChange();
    }
  }

  private log(msg: string): void {
    this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  private fireStateChange(): void {
    this._onDidChangeState.fire(this.state);
  }

  dispose(): void {
    this.stop();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
