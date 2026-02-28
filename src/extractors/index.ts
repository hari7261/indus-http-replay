import { ExtractorResult, ReplayRequest } from '../models/types';
import { extractRawHttp } from './rawHttpExtractor';
import { extractCurl } from './curlExtractor';
import { extractLog } from './logExtractor';
import { extractIndusHttp } from './indusHttpExtractor';

export interface Extractor {
  name: string;
  canHandle(text: string): boolean;
  extract(text: string): ReplayRequest | null;
}

function detectFormat(text: string): string {
  const trimmed = text.trim();

  // curl command
  if (/^\s*curl\s+/i.test(trimmed)) return 'curl';

  // Raw HTTP request line: METHOD /path HTTP/x.x or METHOD /path
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+\S+/m.test(trimmed)) {
    return 'rawHttp';
  }

  // Indus .indus.http format (### separator)
  if (/^###\s*/m.test(trimmed)) return 'indusHttp';

  // Log line pattern
  if (/REQUEST\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+\/\S+/i.test(trimmed)) {
    return 'log';
  }

  return 'unknown';
}

export function extractRequest(text: string): ExtractorResult {
  const format = detectFormat(text);

  switch (format) {
    case 'curl': {
      const r = extractCurl(text);
      return { request: r, extractedFrom: 'curl' };
    }
    case 'rawHttp': {
      const r = extractRawHttp(text);
      return { request: r, extractedFrom: 'rawHttp' };
    }
    case 'indusHttp': {
      const r = extractIndusHttp(text);
      return { request: r, extractedFrom: 'indusHttp' };
    }
    case 'log': {
      const r = extractLog(text);
      return { request: r, extractedFrom: 'log' };
    }
    default:
      // Attempt raw HTTP as fallback
      const fallback = extractRawHttp(text);
      if (fallback) return { request: fallback, extractedFrom: 'rawHttp' };
      return {
        request: null,
        error: 'Could not detect HTTP request format in selection',
        extractedFrom: 'unknown',
      };
  }
}

export function parseQueryString(search: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!search) return result;
  const qs = search.startsWith('?') ? search.slice(1) : search;
  for (const part of qs.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      result[decodeURIComponent(part)] = '';
    } else {
      result[decodeURIComponent(part.slice(0, eq))] =
        decodeURIComponent(part.slice(eq + 1));
    }
  }
  return result;
}
