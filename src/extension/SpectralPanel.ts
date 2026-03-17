import * as vscode from "vscode";
import { handleMessage } from "./messageHandler";

/**
 * Manages the Spectral Curiosity webview panel.
 * Singleton pattern — only one panel at a time.
 */
export class SpectralPanel implements vscode.Disposable {
  public static currentPanel: SpectralPanel | undefined;
  private static readonly viewType = "spectralCuriosity";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (msg: { type: string; id: string; method: string; params?: unknown }) => {
        if (msg.type !== "request") return;

        try {
          const data = await handleMessage(msg.method, msg.params);
          this.panel.webview.postMessage({ type: "response", id: msg.id, data });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          this.panel.webview.postMessage({ type: "response", id: msg.id, error: errorMsg });
        }
      },
      null,
      this.disposables,
    );

    // Cleanup on close
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(extensionUri: vscode.Uri) {
    // If panel exists, reveal it
    if (SpectralPanel.currentPanel) {
      SpectralPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SpectralPanel.viewType,
      "⚡ Spectral Curiosity",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
      },
    );

    SpectralPanel.currentPanel = new SpectralPanel(panel, extensionUri);
  }

  dispose() {
    SpectralPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const distUri = vscode.Uri.joinPath(this.extensionUri, "dist");

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.css"));

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}';">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <title>Spectral Curiosity</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
