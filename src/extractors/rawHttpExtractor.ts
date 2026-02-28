import { ReplayRequest } from '../models/types';
import { parseQueryString } from './index';

/**
 * Parses a raw HTTP request block:
 *
 * POST /api/users HTTP/1.1
 * Host: localhost:8080
 * Authorization: Bearer xxx
 * Content-Type: application/json
 *
 * {"name":"hari"}
 */
export function extractRawHttp(text: string): ReplayRequest | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let cursor = 0;

  // Skip blank lines at start
  while (cursor < lines.length && lines[cursor].trim() === '') cursor++;

  if (cursor >= lines.length) return null;

  // Parse request line
  const requestLine = lines[cursor].trim();
  const requestLineMatch = requestLine.match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\S+)(?:\s+HTTP\/[\d.]+)?$/i,
  );

  if (!requestLineMatch) return null;

  const method = requestLineMatch[1].toUpperCase();
  const rawPath = requestLineMatch[2];

  // Split path and query
  const qIdx = rawPath.indexOf('?');
  const path = qIdx === -1 ? rawPath : rawPath.slice(0, qIdx);
  const query = qIdx === -1 ? {} : parseQueryString(rawPath.slice(qIdx));

  cursor++;

  // Parse headers until blank line
  const headers: Record<string, string> = {};
  while (cursor < lines.length && lines[cursor].trim() !== '') {
    const headerLine = lines[cursor];
    const colonIdx = headerLine.indexOf(':');
    if (colonIdx !== -1) {
      const name = headerLine.slice(0, colonIdx).trim().toLowerCase();
      const value = headerLine.slice(colonIdx + 1).trim();
      // Skip Host header — we reconstruct it from target base URL
      if (name !== 'host') {
        headers[name] = value;
      }
    }
    cursor++;
  }

  // Skip blank line separator
  while (cursor < lines.length && lines[cursor].trim() === '') cursor++;

  // Remaining lines = body
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
