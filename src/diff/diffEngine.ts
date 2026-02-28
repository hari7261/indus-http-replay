import { DiffNode, DiffResult } from '../models/types';

/**
 * JSON-aware diff engine.
 * - Key-order independent
 * - Array-aware (index matched)
 * - Type-aware
 * - Supports ignore paths (JSONPath-like: $.field, $.obj.field, $[0].field)
 */
export function diffResults(
  leftBody: string,
  rightBody: string,
  leftHeaders: Record<string, string>,
  rightHeaders: Record<string, string>,
  leftStatus: number,
  rightStatus: number,
  ignorePaths: string[] = [],
): DiffResult {
  // Header diff
  const headerDiff = diffFlatObjects(leftHeaders, rightHeaders);

  // Status diff
  const statusDiff = {
    left: leftStatus,
    right: rightStatus,
    changed: leftStatus !== rightStatus,
  };

  // Body diff
  const leftJson = tryParseJson(leftBody);
  const rightJson = tryParseJson(rightBody);

  const isJsonDiff = leftJson !== undefined || rightJson !== undefined;
  let bodyDiff: DiffNode[];

  if (isJsonDiff) {
    const normalizedLeft = leftJson ?? leftBody;
    const normalizedRight = rightJson ?? rightBody;
    const ignoreSet = buildIgnoreSet(ignorePaths);
    bodyDiff = diffJsonValues(normalizedLeft, normalizedRight, '$', ignoreSet);
  } else {
    bodyDiff = diffText(leftBody, rightBody);
  }

  return {
    bodyDiff,
    headerDiff,
    statusDiff,
    isJsonDiff,
    leftRaw: leftBody,
    rightRaw: rightBody,
  };
}

function tryParseJson(text: string): unknown | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function buildIgnoreSet(paths: string[]): Set<string> {
  // Normalize: $.foo.bar -> $.foo.bar, $.foo -> $.foo
  return new Set(paths.map((p) => p.trim()));
}

function shouldIgnore(path: string, ignoreSet: Set<string>): boolean {
  return ignoreSet.has(path);
}

function diffJsonValues(
  left: unknown,
  right: unknown,
  path: string,
  ignoreSet: Set<string>,
): DiffNode[] {
  if (shouldIgnore(path, ignoreSet)) {
    return [];
  }

  // Both are plain objects
  if (isObject(left) && isObject(right)) {
    return diffObjects(
      left as Record<string, unknown>,
      right as Record<string, unknown>,
      path,
      ignoreSet,
    );
  }

  // Both are arrays
  if (Array.isArray(left) && Array.isArray(right)) {
    return diffArrays(left, right, path, ignoreSet);
  }

  // Scalar comparison
  if (left === right) {
    return [{ path, kind: 'unchanged', leftValue: left, rightValue: right }];
  }

  return [{ path, kind: 'changed', leftValue: left, rightValue: right }];
}

function diffObjects(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  path: string,
  ignoreSet: Set<string>,
): DiffNode[] {
  const nodes: DiffNode[] = [];
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of [...allKeys].sort()) {
    const childPath = `${path}.${key}`;
    if (shouldIgnore(childPath, ignoreSet)) continue;

    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);

    if (!hasLeft) {
      nodes.push({ path: childPath, kind: 'added', rightValue: right[key] });
    } else if (!hasRight) {
      nodes.push({ path: childPath, kind: 'removed', leftValue: left[key] });
    } else {
      const childDiff = diffJsonValues(left[key], right[key], childPath, ignoreSet);
      nodes.push(...childDiff);
    }
  }

  return nodes;
}

function diffArrays(
  left: unknown[],
  right: unknown[],
  path: string,
  ignoreSet: Set<string>,
): DiffNode[] {
  const nodes: DiffNode[] = [];
  const maxLen = Math.max(left.length, right.length);

  for (let i = 0; i < maxLen; i++) {
    const childPath = `${path}[${i}]`;
    if (shouldIgnore(childPath, ignoreSet)) continue;

    if (i >= left.length) {
      nodes.push({ path: childPath, kind: 'added', rightValue: right[i] });
    } else if (i >= right.length) {
      nodes.push({ path: childPath, kind: 'removed', leftValue: left[i] });
    } else {
      const childDiff = diffJsonValues(left[i], right[i], childPath, ignoreSet);
      nodes.push(...childDiff);
    }
  }

  return nodes;
}

function diffFlatObjects(
  left: Record<string, string>,
  right: Record<string, string>,
): DiffNode[] {
  const nodes: DiffNode[] = [];
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of [...allKeys].sort()) {
    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);

    if (!hasLeft) {
      nodes.push({ path: key, kind: 'added', rightValue: right[key] });
    } else if (!hasRight) {
      nodes.push({ path: key, kind: 'removed', leftValue: left[key] });
    } else if (left[key] !== right[key]) {
      nodes.push({ path: key, kind: 'changed', leftValue: left[key], rightValue: right[key] });
    } else {
      nodes.push({ path: key, kind: 'unchanged', leftValue: left[key], rightValue: right[key] });
    }
  }

  return nodes;
}

function diffText(left: string, right: string): DiffNode[] {
  if (left === right) {
    return [{ path: '$', kind: 'unchanged', leftValue: left, rightValue: right }];
  }
  return [{ path: '$', kind: 'changed', leftValue: left, rightValue: right }];
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Summarise diff for display: count added/removed/changed nodes.
 */
export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  total: number;
  hasDiff: boolean;
}

export function summariseDiff(nodes: DiffNode[]): DiffSummary {
  let added = 0;
  let removed = 0;
  let changed = 0;

  function walk(n: DiffNode) {
    if (n.kind === 'added') added++;
    else if (n.kind === 'removed') removed++;
    else if (n.kind === 'changed') changed++;
    if (n.children) n.children.forEach(walk);
  }

  nodes.forEach(walk);
  const total = added + removed + changed;
  return { added, removed, changed, total, hasDiff: total > 0 };
}
