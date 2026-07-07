/**
 * `@-` stdin extraction.
 *
 * An arg token that is exactly `@-` is replaced with the raw stdin
 * content. A token of the form `@-::json.path` reads stdin, `JSON.parse`s
 * it, and substitutes the value at `json.path` (dot-separated).
 *
 * Reading stdin is injected (`readStdin`) rather than hardwired to
 * `process.stdin` so tests can supply fixed content without mocking
 * global I/O — see `readProcessStdin()` for the real-CLI default.
 */

import { NounVerbError } from './errors.js';
import { getByPath, stringifyExtractedValue } from './path.js';

export const STDIN_TOKEN = '@-';
export const STDIN_PATH_PREFIX = '@-::';

/** Whether any token in `rawArgs` requires stdin to be read. */
export function needsStdin(rawArgs: readonly string[]): boolean {
  return rawArgs.some((token) => token === STDIN_TOKEN || token.startsWith(STDIN_PATH_PREFIX));
}

/** Resolve a single token against already-read stdin content. Non-`@-` tokens pass through unchanged. */
export function substituteStdinToken(token: string, stdinContent: string): string {
  if (token === STDIN_TOKEN) {
    return stdinContent;
  }
  if (!token.startsWith(STDIN_PATH_PREFIX)) {
    return token;
  }

  const path = token.slice(STDIN_PATH_PREFIX.length);
  if (!path) {
    throw NounVerbError.invalidInput(`'${token}' is missing a path — use '@-::field.path'.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdinContent);
  } catch (err) {
    throw NounVerbError.invalidInput(`'${token}' requires valid JSON on stdin: ${(err as Error).message}`);
  }

  const value = getByPath(parsed, path);
  if (value === undefined) {
    throw NounVerbError.invalidInput(`'${token}' — path '${path}' not found in stdin JSON.`);
  }
  return stringifyExtractedValue(value);
}

/**
 * Resolve every `@-`/`@-::path` token in `rawArgs`, reading stdin at most
 * once (only if at least one token needs it). Returns a new array;
 * `rawArgs` is never mutated.
 */
export async function resolveStdinRefs(
  rawArgs: readonly string[],
  readStdin: () => Promise<string>
): Promise<string[]> {
  if (!needsStdin(rawArgs)) {
    return [...rawArgs];
  }
  const stdinContent = await readStdin();
  return rawArgs.map((token) => substituteStdinToken(token, stdinContent));
}

/** Default stdin reader for real CLI usage: reads `process.stdin` to completion. Empty string if stdin is a TTY (nothing piped). */
export async function readProcessStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
