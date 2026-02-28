import * as path from 'path';
import * as vscode from 'vscode';
import { HistoryEntry } from '../models/types';

const HISTORY_KEY = 'indus.replayHistory';
const MAX_HISTORY = 100;

export class HistoryManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): HistoryEntry[] {
    return this.context.globalState.get<HistoryEntry[]>(HISTORY_KEY, []);
  }

  add(entry: HistoryEntry): void {
    const current = this.getAll();
    const updated = [entry, ...current].slice(0, MAX_HISTORY);
    this.context.globalState.update(HISTORY_KEY, updated);
  }

  clear(): void {
    this.context.globalState.update(HISTORY_KEY, []);
  }

  remove(id: string): void {
    const updated = this.getAll().filter((e) => e.id !== id);
    this.context.globalState.update(HISTORY_KEY, updated);
  }

  getById(id: string): HistoryEntry | undefined {
    return this.getAll().find((e) => e.id === id);
  }

  /**
   * Build a formatted HTML table for the history webview.
   */
  buildHtmlTable(nonce: string, cspSource: string): string {
    const entries = this.getAll();
    const rows =
      entries.length === 0
        ? '<tr><td colspan="5" class="empty">No replay history yet.</td></tr>'
        : entries
            .map((e) => {
              const date = new Date(e.timestamp).toLocaleString();
              const targets = e.targets.join(', ');
              const statuses = Object.entries(e.statusSummary)
                .map(([t, s]) => `${t}: ${s}`)
                .join(' | ');
              return `<tr>
              <td>${date}</td>
              <td class="method ${e.method.toLowerCase()}">${e.method}</td>
              <td class="path">${escapeHtml(e.path)}</td>
              <td>${escapeHtml(targets)}</td>
              <td>${escapeHtml(statuses)}</td>
            </tr>`;
            })
            .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Indus Replay History</title>
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--vscode-panel-border); font-weight: 600; }
    td { padding: 6px 12px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
    .method { font-weight: bold; font-family: monospace; }
    .get { color: #4caf50; }
    .post { color: #2196f3; }
    .put { color: #ff9800; }
    .patch { color: #9c27b0; }
    .delete { color: #f44336; }
    .path { font-family: monospace; }
    .empty { text-align: center; color: var(--vscode-descriptionForeground); padding: 24px; }
    h1 { font-size: 1.2em; margin-bottom: 16px; }
    .clear-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 14px; cursor: pointer; border-radius: 3px; margin-bottom: 16px; }
    .clear-btn:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <h1>Indus Replay History</h1>
  <button class="clear-btn" onclick="clearHistory()">Clear History</button>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Method</th>
        <th>Path</th>
        <th>Targets</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function clearHistory() {
      vscode.postMessage({ command: 'clearHistory' });
    }
  </script>
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
