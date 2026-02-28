import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';

import { extractRequest } from './extractors/index';
import { parseHarFile } from './extractors/harExtractor';
import { parseAllBlocks } from './extractors/indusHttpExtractor';
import { getTargets, buildWorkerOptions, promptAndSaveTargets } from './config/settings';
import { WorkerPool } from './worker/workerPool';
import { ReplayPanel, PanelSession } from './panels/replayPanel';
import { HistoryPanel } from './panels/historyPanel';
import { HistoryManager } from './history/historyManager';
import { IndusHttpCodeLensProvider } from './codelens/indusHttpCodeLens';
import { ReplayRequest, ReplayTarget, HistoryEntry } from './models/types';

let workerPool: WorkerPool | undefined;
let historyManager: HistoryManager | undefined;
let codeLensProvider: IndusHttpCodeLensProvider | undefined;

// Active sessions: sessionId -> session tracking data
interface SessionTracker {
  expected: number;
  received: number;
  request: ReplayRequest;
  targets: ReplayTarget[];
  statusMap: Record<string, number | string>;
}

const activeSessions = new Map<string, SessionTracker>();

export function activate(context: vscode.ExtensionContext): void {
  historyManager = new HistoryManager(context);

  // Initialise worker pool pointing to the bundled worker script
  const distDir = path.join(context.extensionPath, 'dist');
  workerPool = new WorkerPool(distDir);

  // Wire worker events
  workerPool.on('result', (sessionId, result) => {
    const panel = ReplayPanel.getInstance();
    panel?.updateResult(sessionId, result);

    // Track completion
    const tracker = activeSessions.get(sessionId);
    if (tracker) {
      tracker.received++;
      tracker.statusMap[result.target] = result.error
        ? result.error.kind
        : result.status;

      if (tracker.received >= tracker.expected) {
        panel?.markComplete(sessionId);
        activeSessions.delete(sessionId);
        // Save lightweight history entry
        recordHistory(tracker.request, tracker.targets, tracker.statusMap);
      }
    }
  });

  workerPool.on('progress', (sessionId, target, phase) => {
    ReplayPanel.getInstance()?.updateProgress(sessionId, target, phase);
  });

  workerPool.on('error', (_sessionId, message) => {
    vscode.window.showErrorMessage(`Indus Worker Error: ${message}`);
  });

  // ── CodeLens for .indus.http files ─────────────────────────────────────────
  codeLensProvider = new IndusHttpCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'indus-http', pattern: '**/*.indus.http' },
      codeLensProvider,
    ),
  );

  // Refresh code lenses on document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'indus-http') {
        codeLensProvider?.refresh();
      }
    }),
  );

  // ── Commands ───────────────────────────────────────────────────────────────

  // Primary: Replay HTTP Request (from selection)
  context.subscriptions.push(
    vscode.commands.registerCommand('indus.replayHttpRequest', async () => {
      await replayFromSelection(context);
    }),
  );

  // Replay from CodeLens button
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'indus.replayFromCodeLens',
      async (request: ReplayRequest, name: string) => {
        await executeReplay(request, context);
      },
    ),
  );

  // Configure Targets
  context.subscriptions.push(
    vscode.commands.registerCommand('indus.configureTargets', async () => {
      await promptAndSaveTargets();
    }),
  );

  // Open Replay History
  context.subscriptions.push(
    vscode.commands.registerCommand('indus.openReplayHistory', () => {
      HistoryPanel.open(context.extensionUri, historyManager!);
    }),
  );

  // Clear Replay History
  context.subscriptions.push(
    vscode.commands.registerCommand('indus.clearReplayHistory', () => {
      historyManager?.clear();
      vscode.window.showInformationMessage('Indus: Replay history cleared.');
    }),
  );

  // Register disposable cleanup
  context.subscriptions.push({
    dispose: () => {
      workerPool?.dispose();
      codeLensProvider?.dispose();
    },
  });
}

export function deactivate(): void {
  workerPool?.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// Core replay logic
// ─────────────────────────────────────────────────────────────────────────────

async function replayFromSelection(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Indus: No active editor.');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(
    selection.isEmpty ? undefined : selection,
  );

  if (!selectedText.trim()) {
    vscode.window.showWarningMessage(
      'Indus: Select text containing an HTTP request or curl command.',
    );
    return;
  }

  // Check for HAR file
  if (editor.document.fileName.endsWith('.har') || editor.document.languageId === 'json') {
    const docText = editor.document.getText();
    const entries = parseHarFile(docText);
    if (entries.length > 0) {
      await replayFromHar(entries, context);
      return;
    }
  }

  const extracted = extractRequest(selectedText);

  if (!extracted.request) {
    vscode.window.showErrorMessage(
      `Indus: Could not extract HTTP request. ${extracted.error ?? 'Unknown format.'}`,
    );
    return;
  }

  await executeReplay(extracted.request, context);
}

async function replayFromHar(
  entries: Array<{ index: number; summary: string; request: import('./models/types').ReplayRequest }>,
  context: vscode.ExtensionContext,
): Promise<void> {
  const items = entries.map((e) => ({
    label: e.summary,
    description: `Entry ${e.index}`,
    request: e.request,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Indus: Select HAR Entry to Replay',
    placeHolder: 'Choose request…',
  });

  if (!picked) return;
  await executeReplay(picked.request, context);
}

async function executeReplay(
  request: ReplayRequest,
  context: vscode.ExtensionContext,
): Promise<void> {
  // Get targets — prompt if none configured
  let targets = getTargets();

  if (targets.length === 0 || (targets.length === 1 && !targets[0].baseUrl)) {
    const saved = await promptAndSaveTargets();
    if (!saved || saved.length === 0) return;
    targets = saved;
  }

  const options = buildWorkerOptions();

  // Create or reuse panel
  const cancelFn = (sid: string) => workerPool?.cancel(sid);
  const panel = ReplayPanel.create(context.extensionUri, cancelFn);

  const sessionId = crypto.randomUUID();

  const session: PanelSession = {
    id: sessionId,
    request,
    targets,
    results: new Map(),
    startedAt: Date.now(),
  };

  panel.startSession(session);

  // Track expected results
  activeSessions.set(sessionId, {
    expected: targets.length,
    received: 0,
    request,
    targets,
    statusMap: {},
  });

  // Dispatch to worker
  workerPool?.execute(sessionId, request, targets, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// History recording
// ─────────────────────────────────────────────────────────────────────────────

function recordHistory(
  request: ReplayRequest,
  targets: ReplayTarget[],
  statusMap: Record<string, number | string>,
): void {
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    method: request.method,
    path: request.path,
    targets: targets.map((t) => t.baseUrl),
    statusSummary: statusMap,
  };
  historyManager?.add(entry);
}
