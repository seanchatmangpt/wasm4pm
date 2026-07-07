/**
 * Content-sniffing format detector.
 *
 * Fixes defect #4 (extension-based format detection with misleading errors)
 * and is the shared foundation for defect #2 (oracle conform vacuously
 * admits anything because it only understands OCEL v2 `relationships[]`,
 * while exported traces may be OCEL v1 `ocel:omap`). Detection reads file
 * *content*, never the extension — `.json` alone tells you nothing about
 * whether a file is XES-as-JSON, OCEL v1, or OCEL v2.
 */

export type LogFormat = 'xes' | 'csv' | 'ocel-v1' | 'ocel-v2' | 'ocel-ndjson';

export class UnrecognizedFormatError extends Error {
  constructor(public readonly sample: string) {
    super(
      'Could not detect log format from content. Recognized formats: ' +
        'XES (<log ...> XML), OCEL 2.0 JSON ({eventTypes, objectTypes, events, objects}), ' +
        'OCEL 1.0 JSON ({"ocel:global-log": ..., "ocel:events": ...}), ' +
        'OCEL 2.0 NDJSON (one JSON event object per line), CSV (comma-delimited with a header row).'
    );
    this.name = 'UnrecognizedFormatError';
  }
}

function looksLikeXes(trimmed: string): boolean {
  if (!trimmed.startsWith('<')) return false;
  // XES root is <log ...>, optionally preceded by an XML prolog/comments.
  const head = trimmed.slice(0, 4096);
  return /<\?xml[^>]*\?>/i.test(head.slice(0, 200)) ? head.includes('<log') : head.includes('<log');
}

function tryParseJson(content: string): unknown | undefined {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function isOcelV2Json(obj: Record<string, unknown>): boolean {
  // OCEL 2.0 JSON: camelCase top-level keys, events carry `relationships[]`.
  const hasV2Shape =
    (Array.isArray(obj['eventTypes']) || Array.isArray(obj['objectTypes'])) &&
    Array.isArray(obj['events']) &&
    Array.isArray(obj['objects']);
  if (hasV2Shape) return true;
  // Some exports carry an explicit version marker without full top-level arrays.
  const globalLog = obj['ocel:global-log'];
  if (globalLog && typeof globalLog === 'object') {
    const v = (globalLog as Record<string, unknown>)['ocel:version'];
    if (typeof v === 'string' && v.startsWith('2')) return true;
  }
  return false;
}

function isOcelV1Json(obj: Record<string, unknown>): boolean {
  // OCEL 1.0 JSON ("JSONOCEL"): `ocel:events`/`ocel:objects` are ID-keyed
  // maps (not arrays), events carry `ocel:omap` (flat object-id list, no
  // qualifier) rather than v2's `relationships[]`.
  return (
    obj['ocel:events'] !== undefined ||
    obj['ocel:objects'] !== undefined ||
    obj['ocel:global-log'] !== undefined
  );
}

function looksLikeCsv(trimmed: string): boolean {
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.includes(',')) return false;
  // Header row heuristic: at least 2 comma-separated columns, no leading '{'/'<'.
  return firstLine.split(',').length >= 2 && !firstLine.trimStart().startsWith('{') && !firstLine.trimStart().startsWith('<');
}

function looksLikeOcelNdjson(trimmed: string): boolean {
  const firstLine = trimmed.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!firstLine) return false;
  const parsed = tryParseJson(firstLine.trim());
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  // A single NDJSON event line looks like an OCEL v2 event: id/type/time + relationships.
  return typeof obj['id'] === 'string' && typeof obj['type'] === 'string' && ('relationships' in obj || 'time' in obj);
}

/**
 * Detect the format of log content by sniffing its bytes. Throws
 * `UnrecognizedFormatError` rather than falling back to a default —
 * silent misdetection is exactly what produced defect #2 and #4.
 */
export function detectFormat(content: string): LogFormat {
  const trimmed = content.trimStart();
  if (trimmed.length === 0) {
    throw new UnrecognizedFormatError('');
  }

  if (looksLikeXes(trimmed)) return 'xes';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = tryParseJson(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (isOcelV2Json(obj)) return 'ocel-v2';
      if (isOcelV1Json(obj)) return 'ocel-v1';
    }
    // A JSON document that parses but matches neither OCEL dialect is not a
    // format this engine understands (e.g. an arbitrary JSON array) — fall
    // through to the generic error rather than guessing.
  } else if (looksLikeOcelNdjson(trimmed)) {
    return 'ocel-ndjson';
  } else if (looksLikeCsv(trimmed)) {
    return 'csv';
  }

  throw new UnrecognizedFormatError(trimmed.slice(0, 120));
}

/** True if `format` is one of the object-centric dialects. */
export function isOcelFormat(format: LogFormat): boolean {
  return format === 'ocel-v1' || format === 'ocel-v2' || format === 'ocel-ndjson';
}
