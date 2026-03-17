import * as vscode from "vscode";
import { SpectralPanel } from "./SpectralPanel";

export function activate(context: vscode.ExtensionContext) {
  const openCommand = vscode.commands.registerCommand("spectralCuriosity.open", () => {
    SpectralPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(openCommand);

  // Auto-dispose panel when extension deactivates
  if (SpectralPanel.currentPanel) {
    context.subscriptions.push(SpectralPanel.currentPanel);
  }
}

export function deactivate() {
  // Cleanup handled by disposables
}
