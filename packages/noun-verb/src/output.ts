/**
 * Output layer — the mechanism that kills wpm defect 3 ("--json prints
 * human text to stdout") BY CONSTRUCTION.
 *
 * Contract:
 *   - stdout ALWAYS receives exactly one bounded JSON value.
 *   - `--human` additionally renders to stderr.
 *   - handlers never write through this module directly.
 */
import type { VerbContext } from './types.js';
import {
  DEFAULT_OUTPUT_MAX_BYTES,
  boundedIntegerFromEnv,
  guardExceeded,
} from './limits.js';
import { NounVerbError } from './errors.js';

export function outputMaxBytesFromEnv(): number {
  return boundedIntegerFromEnv(
    'NOUN_VERB_OUTPUT_MAX_BYTES',
    DEFAULT_OUTPUT_MAX_BYTES,
    { min: 1024, max: 1024 * 1024 * 1024 }
  );
}

export function serializeJson(
  value: unknown,
  maxBytes = outputMaxBytesFromEnv()
): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(value, null, 2);
  } catch (error) {
    throw NounVerbError.internalError(
      `OUTPUT_NOT_JSON_SERIALIZABLE: ${(error as Error).message}`,
      error
    );
  }
  if (json === undefined) {
    throw NounVerbError.internalError(
      'OUTPUT_NOT_JSON_SERIALIZABLE: top-level undefined, function, and symbol results are refused'
    );
  }
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > maxBytes) {
    throw guardExceeded(
      `OUTPUT_SIZE_GUARD_EXCEEDED: ${bytes} bytes exceeds ${maxBytes}`,
      { observed_bytes: bytes, max_bytes: maxBytes }
    );
  }
  return json;
}

/** Write a single bounded JSON value to stdout as the canonical machine result. */
export function writeJson(value: unknown): void {
  process.stdout.write(`${serializeJson(value)}\n`);
}

/** Write human-readable text to stderr. Never touches stdout. */
export function writeHumanToStderr(text: string): void {
  process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
}

/**
 * Fallback formatter used for `--human` when a verb doesn't supply its own
 * renderer.
 */
export function defaultHumanFormat<T>(result: T): string {
  if (result === null || result === undefined) {
    return String(result);
  }
  if (typeof result === 'object' && !Array.isArray(result)) {
    const lines = Object.entries(result as Record<string, unknown>).map(
      ([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
    );
    return lines.length > 0 ? lines.join('\n') : '(empty result)';
  }
  if (Array.isArray(result)) {
    return result.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join('\n');
  }
  return String(result);
}

/** Print the experimental banner to stderr. */
export function writeExperimentalBanner(ctx: VerbContext): void {
  process.stderr.write(
    `[experimental] '${ctx.noun} ${ctx.verb}' is experimental and may change or be removed without notice.\n`
  );
}
