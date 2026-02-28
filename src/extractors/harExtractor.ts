import { ReplayRequest } from '../models/types';
import { parseQueryString } from './index';

export interface HarEntry {
  index: number;
  method: string;
  url: string;
  path: string;
  summary: string;
  request: ReplayRequest;
}

/**
 * Parse a HAR (HTTP Archive) file and return all request entries.
 */
export function parseHarFile(content: string): HarEntry[] {
  let har: HarJson;
  try {
    har = JSON.parse(content) as HarJson;
  } catch {
    return [];
  }

  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) return [];

  const result: HarEntry[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const req = entry?.request;
    if (!req) continue;

    const harRequest = convertHarRequest(req);
    if (!harRequest) continue;

    let urlStr = req.url || '';
    let path = '/';
    try {
      const u = new URL(urlStr);
      path = u.pathname + u.search;
    } catch {
      path = urlStr;
    }

    result.push({
      index: i,
      method: req.method || 'GET',
      url: urlStr,
      path,
      summary: `${req.method} ${path}`,
      request: harRequest,
    });
  }

  return result;
}

/**
 * Extract a single HAR entry by index.
 */
export function extractHarEntry(content: string, index: number): ReplayRequest | null {
  const entries = parseHarFile(content);
  const entry = entries.find((e) => e.index === index);
  return entry?.request ?? null;
}

function convertHarRequest(req: HarRequest): ReplayRequest | null {
  if (!req.method || !req.url) return null;

  const method = req.method.toUpperCase();

  let path = '/';
  let query: Record<string, string> | undefined;
  try {
    const u = new URL(req.url);
    path = u.pathname;
    if (u.search) query = parseQueryString(u.search);
  } catch {
    path = req.url;
  }

  // Override query from HAR queryString array if present
  if (Array.isArray(req.queryString) && req.queryString.length > 0) {
    query = {};
    for (const kv of req.queryString) {
      query[kv.name] = kv.value;
    }
  }

  // Build headers
  const headers: Record<string, string> = {};
  if (Array.isArray(req.headers)) {
    for (const h of req.headers) {
      const name = h.name.toLowerCase();
      // Skip pseudo-headers and host (we rewrite from target)
      if (name.startsWith(':') || name === 'host' || name === 'content-length') continue;
      headers[name] = h.value;
    }
  }

  // Body
  let body: string | undefined;
  const postData = req.postData;
  if (postData) {
    body = postData.text || undefined;
    if (!body && Array.isArray(postData.params) && postData.params.length > 0) {
      body = postData.params
        .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value ?? '')}`)
        .join('&');
    }
    if (body && !headers['content-type'] && postData.mimeType) {
      headers['content-type'] = postData.mimeType;
    }
  }

  return {
    method,
    path,
    headers,
    query: query && Object.keys(query).length > 0 ? query : undefined,
    body,
  };
}

// Minimal HAR type definitions
interface HarJson {
  log: {
    entries: Array<{
      request: HarRequest;
    }>;
  };
}

interface HarRequest {
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  queryString?: Array<{ name: string; value: string }>;
  postData?: {
    mimeType: string;
    text?: string;
    params?: Array<{ name: string; value?: string }>;
  };
}
