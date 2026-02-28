/**
 * Core data models for Indus HTTP Replay
 */

export interface ReplayRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
}

export interface ReplayTarget {
  name: string;
  baseUrl: string;
}

export interface ReplayResult {
  target: string;
  status: number;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  error?: ReplayError;
}

export type ReplayErrorKind =
  | 'connection'
  | 'dns'
  | 'tls'
  | 'timeout'
  | 'cancelled'
  | 'unknown';

export interface ReplayError {
  kind: ReplayErrorKind;
  message: string;
}

export interface ReplaySession {
  id: string;
  request: ReplayRequest;
  targets: ReplayTarget[];
  results: ReplayResult[];
  startedAt: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  targets: string[];
  statusSummary: Record<string, number | string>;
}

// IPC messages between extension host and worker

export type WorkerMessageType =
  | 'execute'
  | 'cancel'
  | 'result'
  | 'error'
  | 'progress';

export interface WorkerExecuteMessage {
  type: 'execute';
  sessionId: string;
  request: ReplayRequest;
  targets: ReplayTarget[];
  options: WorkerOptions;
}

export interface WorkerCancelMessage {
  type: 'cancel';
  sessionId: string;
}

export interface WorkerResultMessage {
  type: 'result';
  sessionId: string;
  result: ReplayResult;
}

export interface WorkerErrorMessage {
  type: 'error';
  sessionId: string;
  message: string;
}

export interface WorkerProgressMessage {
  type: 'progress';
  sessionId: string;
  target: string;
  phase: 'connecting' | 'sending' | 'receiving' | 'done';
}

export type WorkerMessage =
  | WorkerExecuteMessage
  | WorkerCancelMessage
  | WorkerResultMessage
  | WorkerErrorMessage
  | WorkerProgressMessage;

export interface WorkerOptions {
  timeoutMs: number;
  followRedirects: boolean;
  allowInsecureTls: boolean;
  defaultHeaders: Record<string, string>;
  concurrencyLimit: number;
}

// Diff model

export type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffNode {
  path: string;
  kind: DiffKind;
  leftValue?: unknown;
  rightValue?: unknown;
  children?: DiffNode[];
}

export interface DiffResult {
  bodyDiff: DiffNode[];
  headerDiff: DiffNode[];
  statusDiff: { left: number; right: number; changed: boolean };
  isJsonDiff: boolean;
  leftRaw: string;
  rightRaw: string;
}

// Extractor

export interface ExtractorResult {
  request: ReplayRequest | null;
  error?: string;
  extractedFrom: 'rawHttp' | 'curl' | 'har' | 'log' | 'indusHttp' | 'unknown';
}
