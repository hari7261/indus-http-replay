import * as vscode from 'vscode';
import { parseAllBlocks } from '../extractors/indusHttpExtractor';

/**
 * Provides "▶ Run" CodeLens above each request block in .indus.http files.
 */
export class IndusHttpCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const text = document.getText();
    const blocks = parseAllBlocks(text);
    const lenses: vscode.CodeLens[] = [];

    for (const block of blocks) {
      const range = new vscode.Range(
        new vscode.Position(block.startLine, 0),
        new vscode.Position(block.startLine, 0),
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '▶ Run',
          command: 'indus.replayFromCodeLens',
          arguments: [block.request, block.name],
          tooltip: `Replay: ${block.name}`,
        }),
      );
    }

    return lenses;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
