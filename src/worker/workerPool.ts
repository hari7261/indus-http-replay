import * as cp from 'child_process';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  WorkerMessage,
  WorkerExecuteMessage,
  WorkerCancelMessage,
  WorkerResultMessage,
  WorkerProgressMessage,
  ReplayRequest,
  ReplayTarget,
  WorkerOptions,
  ReplayResult,
} from '../models/types';

export interface WorkerPoolEvents {
  result: (sessionId: string, result: ReplayResult) => void;
  progress: (sessionId: string, target: string, phase: WorkerProgressMessage['phase']) => void;
  error: (sessionId: string, message: string) => void;
}

/**
 * Manages a single long-lived worker process.
 * Restarts on crash.
 */
export class WorkerPool extends EventEmitter {
  private worker: cp.ChildProcess | null = null;
  private readonly workerPath: string;
  private restarting = false;

  constructor(extensionDistPath: string) {
    super();
    this.workerPath = path.join(extensionDistPath, 'replayWorker.js');
  }

  private ensureWorker(): cp.ChildProcess {
    if (this.worker && !this.worker.killed) {
      return this.worker;
    }

    const child = cp.fork(this.workerPath, [], {
      execArgv: [], // no --inspect to avoid port conflicts
      silent: false, // inherit stderr for debug visibility
    });

    child.on('message', (msg: WorkerMessage) => {
      this.handleMessage(msg);
    });

    child.on('error', (err) => {
      this.emit('error', '__worker__', `Worker process error: ${err.message}`);
    });

    child.on('exit', (code, signal) => {
      if (!this.restarting) {
        // Non-graceful exit — worker crashed
        this.worker = null;
      }
    });

    this.worker = child;
    return child;
  }

  execute(
    sessionId: string,
    request: ReplayRequest,
    targets: ReplayTarget[],
    options: WorkerOptions,
  ): void {
    const worker = this.ensureWorker();
    const msg: WorkerExecuteMessage = {
      type: 'execute',
      sessionId,
      request,
      targets,
      options,
    };
    worker.send(msg);
  }

  cancel(sessionId: string): void {
    if (this.worker && !this.worker.killed) {
      const msg: WorkerCancelMessage = { type: 'cancel', sessionId };
      this.worker.send(msg);
    }
  }

  dispose(): void {
    this.restarting = true;
    if (this.worker) {
      this.worker.kill('SIGTERM');
      this.worker = null;
    }
  }

  private handleMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case 'result': {
        const r = msg as WorkerResultMessage;
        this.emit('result', r.sessionId, r.result);
        break;
      }
      case 'progress': {
        const p = msg as WorkerProgressMessage;
        this.emit('progress', p.sessionId, p.target, p.phase);
        break;
      }
      case 'error': {
        this.emit('error', msg.sessionId, (msg as any).message);
        break;
      }
    }
  }

  // typed emit/on wrappers
  on(event: 'result', listener: (sessionId: string, result: ReplayResult) => void): this;
  on(event: 'progress', listener: (sessionId: string, target: string, phase: WorkerProgressMessage['phase']) => void): this;
  on(event: 'error', listener: (sessionId: string, message: string) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}
