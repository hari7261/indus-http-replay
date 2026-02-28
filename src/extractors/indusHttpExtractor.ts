import { ReplayRequest } from '../models/types';
import { parseQueryString } from './index';

/**
 * Parses .indus.http file format.
 *
 * ### Request name (optional)
 * POST /api/users
 * Content-Type: application/json
 * Authorization: Bearer xxx
 *
 * {"name":"hari"}
 *
 * ### Next request
 * ...
 */
export function extractIndusHttp(text: string): ReplayRequest | null {
  // Extract the first request block only (for single extraction from selection)
  const blocks = splitIntoBlocks(text);
  if (blocks.length === 0) return null;
  return parseBlock(blocks[0]);
}

/**
 * Parse ALL request blocks from a .indus.http file.
 * Returns array of requests with their line positions.
 */
export interface IndusHttpBlock {
  name: string;
  request: ReplayRequest;
  startLine: number;
  endLine: number;
}

export function parseAllBlocks(text: string): IndusHttpBlock[] {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: IndusHttpBlock[] = [];
  const separatorIndices: number[] = [];

  // Find all ### separators
  for (let i = 0; i < rawLines.length; i++) {
    if (/^###/.test(rawLines[i])) {
      separatorIndices.push(i);
    }
  }

  if (separatorIndices.length === 0) {
    // Single block without separator
    const req = parseBlock(text);
    if (req) {
      blocks.push({ name: 'Request', request: req, startLine: 0, endLine: rawLines.length - 1 });
    }
    return blocks;
  }

  for (let s = 0; s < separatorIndices.length; s++) {
    const start = separatorIndices[s];
    const end =
      s + 1 < separatorIndices.length ? separatorIndices[s + 1] - 1 : rawLines.length - 1;

    const nameLine = rawLines[start];
    const name = nameLine.replace(/^###\s*/, '').trim() || `Request ${s + 1}`;
    const blockText = rawLines.slice(start + 1, end + 1).join('\n');
    const req = parseBlock(blockText);
    if (req) {
      blocks.push({ name, request: req, startLine: start, endLine: end });
    }
  }

  return blocks;
}

function splitIntoBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  return normalized.split(/^###[^\n]*\n?/m).filter((b) => b.trim().length > 0);
}

function parseBlock(block: string): ReplayRequest | null {
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  let cursor = 0;

  // Skip comment lines and blanks at start
  while (
    cursor < lines.length &&
    (lines[cursor].trim() === '' || lines[cursor].trim().startsWith('#'))
  ) {
    cursor++;
  }

  if (cursor >= lines.length) return null;

  // Parse request line: METHOD /path [HTTP/1.1]
  const requestLineMatch = lines[cursor]
    .trim()
    .match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\S+)(?:\s+HTTP\/[\d.]+)?$/i);

  if (!requestLineMatch) return null;

  const method = requestLineMatch[1].toUpperCase();
  const rawPath = requestLineMatch[2];

  // Split path and query
  const qIdx = rawPath.indexOf('?');
  const path = qIdx === -1 ? rawPath : rawPath.slice(0, qIdx);
  const query = qIdx === -1 ? {} : parseQueryString(rawPath.slice(qIdx));

  cursor++;

  // Parse headers
  const headers: Record<string, string> = {};
  while (cursor < lines.length && lines[cursor].trim() !== '') {
    const headerLine = lines[cursor];
    // Skip comment lines inside headers
    if (headerLine.trim().startsWith('#')) {
      cursor++;
      continue;
    }
    const colonIdx = headerLine.indexOf(':');
    if (colonIdx !== -1) {
      const name = headerLine.slice(0, colonIdx).trim().toLowerCase();
      const value = headerLine.slice(colonIdx + 1).trim();
      if (name !== 'host') headers[name] = value;
    }
    cursor++;
  }

  // Skip blank separator
  while (cursor < lines.length && lines[cursor].trim() === '') cursor++;

  // Body
  let body: string | undefined;
  if (cursor < lines.length) {
    body = lines.slice(cursor).join('\n').trim() || undefined;
  }

  return {
    method,
    path,
    headers,
    query: Object.keys(query).length > 0 ? query : undefined,
    body,
  };
}
