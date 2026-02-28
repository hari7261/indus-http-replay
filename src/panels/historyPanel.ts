import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { HistoryManager } from '../history/historyManager';

/**
 * Simple WebView panel that shows replay history.
 */
export class HistoryPanel {
  public static readonly viewType = 'indus.historyPanel';
  private static instance: HistoryPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static open(
    extensionUri: vscode.Uri,
    historyManager: HistoryManager,
  ): HistoryPanel {
    if (HistoryPanel.instance) {
      HistoryPanel.instance.panel.reveal(vscode.ViewColumn.Two);
      HistoryPanel.instance.refresh(historyManager);
      return HistoryPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      HistoryPanel.viewType,
      'Indus: Replay History',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [],
      },
    );

    const instance = new HistoryPanel(panel, historyManager);
    HistoryPanel.instance = instance;
    return instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private historyManager: HistoryManager,
  ) {
    this.panel = panel;

    panel.onDidDispose(() => this.dispose(), null, this.disposables);

    panel.webview.onDidReceiveMessage(
      (msg: { command: string }) => {
        if (msg.command === 'clearHistory') {
          this.historyManager.clear();
          this.refresh(this.historyManager);
          vscode.window.showInformationMessage('Indus: Replay history cleared.');
        }
      },
      null,
      this.disposables,
    );

    this.refresh(historyManager);
  }

  refresh(manager: HistoryManager): void {
    const nonce = crypto.randomBytes(16).toString('base64');
    const cspSource = this.panel.webview.cspSource;
    this.panel.webview.html = manager.buildHtmlTable(nonce, cspSource);
  }

  dispose(): void {
    HistoryPanel.instance = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
