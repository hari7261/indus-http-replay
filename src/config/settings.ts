import * as vscode from 'vscode';
import { ReplayTarget, WorkerOptions } from '../models/types';

const SECTION = 'indusHttpReplay';

export function getTargets(): ReplayTarget[] {
  const raw = vscode.workspace
    .getConfiguration(SECTION)
    .get<string[]>('targets', ['http://localhost:8080']);
  return raw.map((url, i) => {
    try {
      const u = new URL(url.trim());
      return { name: u.hostname + (u.port ? `:${u.port}` : ''), baseUrl: url.trim() };
    } catch {
      return { name: `Target ${i + 1}`, baseUrl: url.trim() };
    }
  });
}

export function getDefaultHeaders(): Record<string, string> {
  return vscode.workspace
    .getConfiguration(SECTION)
    .get<Record<string, string>>('defaultHeaders', {});
}

export function getTimeoutMs(): number {
  return vscode.workspace.getConfiguration(SECTION).get<number>('timeoutMs', 30000);
}

export function getFollowRedirects(): boolean {
  return vscode.workspace.getConfiguration(SECTION).get<boolean>('followRedirects', true);
}

export function getIgnoreDiffPaths(): string[] {
  return vscode.workspace
    .getConfiguration(SECTION)
    .get<string[]>('ignoreDiffPaths', ['$.timestamp', '$.traceId', '$.meta.requestId']);
}

export function getAllowInsecureTls(): boolean {
  return vscode.workspace
    .getConfiguration(SECTION)
    .get<boolean>('allowInsecureTls', false);
}

export function buildWorkerOptions(): WorkerOptions {
  return {
    timeoutMs: getTimeoutMs(),
    followRedirects: getFollowRedirects(),
    allowInsecureTls: getAllowInsecureTls(),
    defaultHeaders: getDefaultHeaders(),
    concurrencyLimit: 5,
  };
}

export async function promptAndSaveTargets(): Promise<ReplayTarget[] | undefined> {
  const current = getTargets()
    .map((t) => t.baseUrl)
    .join('\n');

  const input = await vscode.window.showInputBox({
    title: 'Indus: Configure Targets',
    prompt: 'Enter base URLs (one per line)',
    value: current,
    placeHolder: 'http://localhost:8080\nhttp://localhost:8081',
    ignoreFocusOut: true,
    validateInput: (v) => {
      const lines = v
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return 'Enter at least one URL';
      for (const line of lines) {
        try {
          new URL(line);
        } catch {
          return `Invalid URL: ${line}`;
        }
      }
      return null;
    },
  });

  if (input === undefined) return undefined;

  const urls = input
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  await vscode.workspace
    .getConfiguration(SECTION)
    .update('targets', urls, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage(
    `Indus: ${urls.length} target(s) configured.`,
  );

  return getTargets();
}
