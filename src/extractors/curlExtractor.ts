import { ReplayRequest } from '../models/types';
import { parseQueryString } from './index';

/**
 * Parses curl command(s) into a ReplayRequest.
 *
 * Handles:
 *   curl -X POST http://localhost:8080/api/users \
 *     -H "Authorization: Bearer xxx" \
 *     -H "Content-Type: application/json" \
 *     -d '{"name":"hari"}'
 *
 * Also handles --data, --data-raw, --data-binary, --url, -u, --user, etc.
 */
export function extractCurl(text: string): ReplayRequest | null {
  // Normalize line continuations and collapse into single string
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\\\n\s*/g, ' ')
    .trim();

  // Must start with curl
  if (!/^\s*curl\s+/i.test(normalized)) return null;

  // Tokenize respecting quotes
  const tokens = tokenize(normalized);
  if (tokens.length === 0) return null;

  let method: string | undefined;
  let url: string | undefined;
  const headers: Record<string, string> = {};
  let body: string | undefined;

  let i = 1; // skip "curl"
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      i++;
      if (i < tokens.length) method = tokens[i].toUpperCase();
    } else if (token === '-H' || token === '--header') {
      i++;
      if (i < tokens.length) {
        const colonIdx = tokens[i].indexOf(':');
        if (colonIdx !== -1) {
          const name = tokens[i].slice(0, colonIdx).trim().toLowerCase();
          const value = tokens[i].slice(colonIdx + 1).trim();
          if (name !== 'host') headers[name] = value;
        }
      }
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii'
    ) {
      i++;
      if (i < tokens.length) body = tokens[i];
    } else if (token === '--json') {
      i++;
      if (i < tokens.length) {
        body = tokens[i];
        if (!headers['content-type']) headers['content-type'] = 'application/json';
        if (!headers['accept']) headers['accept'] = 'application/json';
      }
    } else if (token === '--form' || token === '-F') {
      i++;
      // skip form data — treat as opaque body hint
    } else if (token === '-u' || token === '--user') {
      i++;
      if (i < tokens.length) {
        const encoded = Buffer.from(tokens[i]).toString('base64');
        headers['authorization'] = `Basic ${encoded}`;
      }
    } else if (token === '--url') {
      i++;
      if (i < tokens.length) url = tokens[i];
    } else if (!token.startsWith('-')) {
      // positional URL
      if (!url) url = token;
    }
    // skip unknown flags and their values for known value-taking flags
    else if (
      [
        '-o', '--output', '--max-time', '--connect-timeout',
        '--proxy', '-x', '--cert', '--key', '--cacert',
        '--user-agent', '-A', '--referer', '-e', '-b', '--cookie',
        '--cookie-jar', '-c', '--max-redirs', '--retry',
      ].includes(token)
    ) {
      i++; // skip the value
    }

    i++;
  }

  if (!url) return null;

  // Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    // Maybe URL has no scheme — try adding http://
    try {
      parsedUrl = new URL('http://' + url);
    } catch {
      return null;
    }
  }

  const path = parsedUrl.pathname || '/';
  const query =
    parsedUrl.search ? parseQueryString(parsedUrl.search) : undefined;

  // Infer method from presence of body if not explicit
  if (!method) {
    method = body ? 'POST' : 'GET';
  }

  // Infer content-type for JSON bodies
  if (body && !headers['content-type']) {
    const trimmed = body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      headers['content-type'] = 'application/json';
    }
  }

  return {
    method,
    path,
    headers,
    query: query && Object.keys(query).length > 0 ? query : undefined,
    body: body || undefined,
  };
}

/**
 * Tokenizes a shell command string respecting single and double quotes.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === '\\' && inDouble && i + 1 < input.length) {
      // Handle escape sequences in double quotes
      const next = input[i + 1];
      if (next === '"' || next === '\\' || next === '$' || next === '`' || next === '\n') {
        current += next;
        i++;
      } else {
        current += ch;
      }
    } else if ((ch === ' ' || ch === '\t') && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
    i++;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}