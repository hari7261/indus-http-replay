import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ReplayRequest, ReplayResult, ReplayTarget, DiffResult } from '../models/types';
import { diffResults } from '../diff/diffEngine';
import { getIgnoreDiffPaths } from '../config/settings';
import { buildWebviewHtml } from './webviewContent';

export interface PanelSession {
  id: string;
  request: ReplayRequest;
  targets: ReplayTarget[];
  results: Map<string, ReplayResult>;   // keyed by target baseUrl
  startedAt: number;
}

/**
 * Manages the Indus HTTP Replay WebView panel.
 * One panel per VS Code window — reused if already open.
 */
export class ReplayPanel {
  public static readonly viewType = 'indus.replayPanel';
  private static instance: ReplayPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private session: PanelSession | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  static create(
    extensionUri: vscode.Uri,
    onCancel: (sessionId: string) => void,
  ): ReplayPanel {
    if (ReplayPanel.instance) {
      ReplayPanel.instance.panel.reveal(vscode.ViewColumn.Two);
      return ReplayPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      ReplayPanel.viewType,
      'Indus HTTP Replay',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );

    const instance = new ReplayPanel(panel, extensionUri, onCancel);
    ReplayPanel.instance = instance;
    return instance;
  }

  static getInstance(): ReplayPanel | undefined {
    return ReplayPanel.instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly onCancel: (sessionId: string) => void,
  ) {
    this.panel = panel;
    this.setLoadingHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: { command: string; sessionId?: string }) => {
        if (message.command === 'cancel' && message.sessionId) {
          this.onCancel(message.sessionId);
        }
      },
      null,
      this.disposables,
    );
  }

  startSession(session: PanelSession): void {
    this.session = session;
    this.panel.reveal(vscode.ViewColumn.Two, true);
    this.panel.title = `Indus ▶ ${session.request.method} ${session.request.path}`;
    this.sendState();
  }

  updateResult(sessionId: string, result: ReplayResult): void {
    if (!this.session || this.session.id !== sessionId) return;
    this.session.results.set(result.target, result);
    this.sendState();
  }

  updateProgress(sessionId: string, target: string, phase: string): void {
    if (!this.session || this.session.id !== sessionId) return;
    this.panel.webview.postMessage({ command: 'progress', target, phase });
  }

  markComplete(sessionId: string): void {
    if (!this.session || this.session.id !== sessionId) return;
    this.panel.webview.postMessage({ command: 'complete' });
  }

  private sendState(): void {
    if (!this.session) return;

    const { id, request, targets, results } = this.session;
    const resultArray = targets.map((t) => results.get(t.baseUrl) ?? null);

    // Compute diff if exactly 2 targets both have results
    let diff: DiffResult | null = null;
    if (targets.length === 2) {
      const r0 = results.get(targets[0].baseUrl);
      const r1 = results.get(targets[1].baseUrl);
      if (r0 && r1) {
        const ignorePaths = getIgnoreDiffPaths();
        diff = diffResults(
          r0.body, r1.body,
          r0.headers, r1.headers,
          r0.status, r1.status,
          ignorePaths,
        );
      }
    }

    this.panel.webview.postMessage({
      command: 'state',
      sessionId: id,
      request,
      targets,
      results: resultArray,
      diff,
    });
  }

  private setLoadingHtml(): void {
    const nonce = getNonce();
    const cspSource = this.panel.webview.cspSource;
    this.panel.webview.html = buildWebviewHtml(nonce, cspSource, this.extensionUri, this.panel.webview);
  }

  dispose(): void {
    ReplayPanel.instance = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}
