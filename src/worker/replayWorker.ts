/**
 * Replay Worker — runs as a separate Node.js child process.
 * Communicates with the extension host via process.on('message') / process.send().
 *
 * Entry point: src/worker/replayWorker.ts
 * Bundled separately by webpack as dist/worker.js
 */

import { request as undiciRequest, Agent } from 'undici';
import * as zlib from 'zlib';
import * as https from 'https';
import {
  WorkerExecuteMessage,
  WorkerCancelMessage,
  WorkerMessage,
  WorkerResultMessage,
  WorkerProgressMessage,
  WorkerErrorMessage,
  ReplayRequest,
  ReplayTarget,
  WorkerOptions,
  ReplayResult,
  ReplayErrorKind,
} from '../models/types';

// Active sessions that can be cancelled
const activeSessions = new Map<string, AbortController>();

// Process incoming messages from extension host
process.on('message', (msg: WorkerMessage) => {
  if (msg.type === 'execute') {
    handleExecute(msg as WorkerExecuteMessage);
  } else if (msg.type === 'cancel') {
    handleCancel(msg as WorkerCancelMessage);
  }
});

process.on('uncaughtException', (err) => {
  safeSend({
    type: 'error',
    sessionId: '__global__',
    message: `Uncaught: ${err.message}`,
  } as WorkerErrorMessage);
});

async function handleExecute(msg: WorkerExecuteMessage): Promise<void> {
  const { sessionId, request, targets, options } = msg;

  const controller = new AbortController();
  activeSessions.set(sessionId, controller);

  // Run all targets with concurrency control
  const semaphore = new Semaphore(options.concurrencyLimit ?? 5);

  const tasks = targets.map((target) =>
    semaphore.run(() => executeOne(sessionId, request, target, options, controller.signal)),
  );

  await Promise.allSettled(tasks);
  activeSessions.delete(sessionId);
}

function handleCancel(msg: WorkerCancelMessage): void {
  const ctrl = activeSessions.get(msg.sessionId);
  if (ctrl) {
    ctrl.abort();
    activeSessions.delete(msg.sessionId);
  }
}

async function executeOne(
  sessionId: string,
  request: ReplayRequest,
  target: ReplayTarget,
  options: WorkerOptions,
  signal: AbortSignal,
): Promise<void> {
  sendProgress(sessionId, target.baseUrl, 'connecting');

  const startMs = Date.now();

  try {
    // Build URL
    const baseUrl = target.baseUrl.replace(/\/$/, '');
    const pathWithQuery = buildPathWithQuery(request);
    const fullUrl = baseUrl + pathWithQuery;

    // Merge headers: defaults < request headers
    const headers: Record<string, string> = {
      ...options.defaultHeaders,
      ...request.headers,
    };

    // Remove host header — undici sets it automatically
    delete headers['host'];

    // Build dispatcher (agent) with TLS/redirect options
    const dispatcher = buildAgent(options);

    sendProgress(sessionId, target.baseUrl, 'sending');

    const response = await undiciRequest(fullUrl, {
      method: request.method as
        | 'GET'
        | 'POST'
        | 'PUT'
        | 'PATCH'
        | 'DELETE'
        | 'HEAD'
        | 'OPTIONS'
        | 'TRACE',
      headers,
      body: request.body ?? null,
      signal,
      dispatcher,
      maxRedirections: options.followRedirects ? 10 : 0,
    });

    sendProgress(sessionId, target.baseUrl, 'receiving');

    // Read body with size guard (10 MB)
    const MAX_BODY = 10 * 1024 * 1024;
    let bodyBuffer = Buffer.alloc(0);
    let truncated = false;

    for await (const chunk of response.body) {
      if (bodyBuffer.length + chunk.length > MAX_BODY) {
        truncated = true;
        break;
      }
      bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
    }

    // Decompress if needed
    const encoding = (response.headers['content-encoding'] as string) || '';
    let bodyStr = await decompress(bodyBuffer, encoding);

    if (truncated) {
      bodyStr += '\n[... truncated at 10MB ...]';
    }

    const durationMs = Date.now() - startMs;

    // Collect response headers (flatten arrays)
    const respHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(response.headers)) {
      respHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : (v ?? '');
    }

    const result: ReplayResult = {
      target: target.baseUrl,
      status: response.statusCode,
      durationMs,
      headers: respHeaders,
      body: bodyStr,
    };

    sendProgress(sessionId, target.baseUrl, 'done');
    sendResult(sessionId, result);
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const { kind, message } = classifyError(err);

    const result: ReplayResult = {
      target: target.baseUrl,
      status: 0,
      durationMs,
      headers: {},
      body: '',
      error: { kind, message },
    };

    sendResult(sessionId, result);
  }
}

function buildPathWithQuery(request: ReplayRequest): string {
  let path = request.path || '/';
  if (request.query && Object.keys(request.query).length > 0) {
    const qs = Object.entries(request.query)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    path += (path.includes('?') ? '&' : '?') + qs;
  }
  return path;
}

function buildAgent(options: WorkerOptions): Agent {
  return new Agent({
    connect: {
      rejectUnauthorized: !options.allowInsecureTls,
    },
    headersTimeout: options.timeoutMs,
    bodyTimeout: options.timeoutMs,
  });
}

async function decompress(buf: Buffer, encoding: string): Promise<string> {
  const enc = encoding.toLowerCase();
  if (enc === 'gzip' || enc === 'x-gzip') {
    return new Promise((resolve, reject) => {
      zlib.gunzip(buf, (err, result) =>
        err ? reject(err) : resolve(result.toString('utf8')),
      );
    });
  } else if (enc === 'br') {
    return new Promise((resolve, reject) => {
      zlib.brotliDecompress(buf, (err, result) =>
        err ? reject(err) : resolve(result.toString('utf8')),
    );
    });
  } else if (enc === 'deflate') {
    return new Promise((resolve, reject) => {
      zlib.inflate(buf, (err, result) =>
        err ? reject(err) : resolve(result.toString('utf8')),
      );
    });
  }
  return buf.toString('utf8');
}

function classifyError(err: unknown): { kind: ReplayErrorKind; message: string } {
  if (err instanceof Error) {
    const msg = err.message;
    if (err.name === 'AbortError') return { kind: 'cancelled', message: 'Request cancelled' };
    if (/ENOTFOUND|getaddrinfo/i.test(msg)) return { kind: 'dns', message: msg };
    if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout/i.test(msg)) return { kind: 'connection', message: msg };
    if (/certificate|ssl|tls|self.signed/i.test(msg)) return { kind: 'tls', message: msg };
    if (/timeout/i.test(msg)) return { kind: 'timeout', message: msg };
    return { kind: 'unknown', message: msg };
  }
  return { kind: 'unknown', message: String(err) };
}

function sendResult(sessionId: string, result: ReplayResult): void {
  safeSend({ type: 'result', sessionId, result } as WorkerResultMessage);
}

function sendProgress(
  sessionId: string,
  target: string,
  phase: WorkerProgressMessage['phase'],
): void {
  safeSend({ type: 'progress', sessionId, target, phase } as WorkerProgressMessage);
}

function safeSend(msg: WorkerMessage): void {
  try {
    process.send?.(msg);
  } catch {
    // Parent may have closed
  }
}

/**
 * Simple binary semaphore for concurrency limiting.
 */
class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          this.running--;
          this.next();
        }
      };

      if (this.running < this.limit) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private next(): void {
    if (this.queue.length > 0 && this.running < this.limit) {
      const next = this.queue.shift()!;
      next();
    }
  }
}
