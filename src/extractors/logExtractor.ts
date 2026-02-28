import { ReplayRequest } from '../models/types';

/**
 * Extracts HTTP requests from log-embedded patterns.
 *
 * Supported patterns:
 *   REQUEST POST /api/users body={"name":"hari"}
 *   [INFO] POST /api/users 200 12ms
 *   --> POST /api/users HTTP/1.1
 *   outgoing request: POST http://host/path
 */
export function extractLog(text: string): ReplayRequest | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    const result = tryParseLogLine(line.trim());
    if (result) return result;
  }

  return null;
}

function tryParseLogLine(line: string): ReplayRequest | null {
  // Pattern 1: REQUEST METHOD /path [body=...]
  const pattern1 = /REQUEST\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/\S*)(.*)/i;
  const m1 = line.match(pattern1);
  if (m1) {
    const method = m1[1].toUpperCase();
    const path = m1[2];
    const rest = m1[3] || '';
    const body = extractBodyFromRest(rest);
    const headers = extractHeadersFromRest(rest);
    return { method, path, headers, body };
  }

  // Pattern 2: --> METHOD /path or [prefix] METHOD /path HTTP/1.1
  const pattern2 =
    /(?:-->|>>|outgoing request:?)\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(https?:\/\/[^\s]+|\/\S*)/i;
  const m2 = line.match(pattern2);
  if (m2) {
    const method = m2[1].toUpperCase();
    const raw = m2[2];
    try {
      const u = new URL(raw.startsWith('/') ? `http://placeholder${raw}` : raw);
      return { method, path: u.pathname + u.search, headers: {} };
    } catch {
      return { method, path: raw, headers: {} };
    }
  }

  // Pattern 3: generic log line "[anything] METHOD /path"
  const pattern3 =
    /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^\s"]*)/i;
  const m3 = line.match(pattern3);
  if (m3) {
    const method = m3[1].toUpperCase();
    const path = m3[2].replace(/[",]+$/, '');
    return { method, path, headers: {} };
  }

  return null;
}

function extractBodyFromRest(rest: string): string | undefined {
  // Matches body=<value> or body="<value>" or body='<value>'
  const bodyMatch = rest.match(/\bbody=(['"])?(.*?)(?:\1|$)/i);
  if (bodyMatch) {
    const val = bodyMatch[2].trim();
    return val || undefined;
  }
  return undefined;
}

function extractHeadersFromRest(rest: string): Record<string, string> {
  const headers: Record<string, string> = {};
  // Matches header=Name:Value patterns
  const headerPattern = /\bheader=([^:,\s]+):([^,\s]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(rest)) !== null) {
    headers[match[1].toLowerCase()] = match[2];
  }
  return headers;
}
