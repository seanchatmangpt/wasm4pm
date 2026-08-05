/**
 * `@-` stdin extraction with bounded memory and wall-clock time.
 */

import { NounVerbError } from './errors.js';
import { getByPath, stringifyExtractedValue } from './path.js';
import {
  DEFAULT_STDIN_MAX_BYTES,
  DEFAULT_STDIN_TIMEOUT_MS,
  boundedIntegerFromEnv,
  deadlineExceeded,
  guardExceeded,
} from './limits.js';

export const STDIN_TOKEN = '@-';
export const STDIN_PATH_PREFIX = '@-::';

export interface StdinReadLimits {
  maxBytes: number;
  timeoutMs: number;
}

export function stdinReadLimitsFromEnv(): StdinReadLimits {
  return {
    maxBytes: boundedIntegerFromEnv(
      'NOUN_VERB_STDIN_MAX_BYTES',
      DEFAULT_STDIN_MAX_BYTES,
      { min: 1, max: 1024 * 1024 * 1024 }
    ),
    timeoutMs: boundedIntegerFromEnv(
      'NOUN_VERB_STDIN_TIMEOUT_MS',
      DEFAULT_STDIN_TIMEOUT_MS,
      { min: 1, max: 10 * 60 * 1000 }
    ),
  };
}

/** Whether any token in `rawArgs` requires stdin to be read. */
export function needsStdin(rawArgs: readonly string[]): boolean {
  return rawArgs.some((token) => token === STDIN_TOKEN || token.startsWith(STDIN_PATH_PREFIX));
}

/** Resolve a single token against already-read stdin content. */
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

/** Resolve all stdin references, reading the source at most once. */
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

export async function readBoundedStdin(
  source: AsyncIterable<Buffer | string>,
  limits: StdinReadLimits,
  onAbort?: (error: Error) => void
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  let observedBytes = 0;

  const read = (async (): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      observedBytes += buffer.byteLength;
      if (observedBytes > limits.maxBytes) {
        throw guardExceeded(
          `STDIN_SIZE_GUARD_EXCEEDED: ${observedBytes} bytes exceeds ${limits.maxBytes}`,
          { observed_bytes: observedBytes, max_bytes: limits.maxBytes }
        );
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, observedBytes).toString('utf8');
  })();

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = deadlineExceeded(
        `STDIN_DEADLINE_EXCEEDED: no complete input within ${limits.timeoutMs}ms`,
        { timeout_ms: limits.timeoutMs, observed_bytes: observedBytes }
      );
      try { onAbort?.(error); } catch { /* preserve the typed timeout */ }
      reject(error);
    }, limits.timeoutMs);
  });

  try {
    return await Promise.race([read, deadline]);
  } catch (error) {
    if (error instanceof NounVerbError && error.code === 'GUARD_EXCEEDED') {
      try { onAbort?.(error); } catch { /* preserve the typed guard */ }
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Default stdin reader for real CLI usage. Empty string if stdin is a TTY.
 */
export async function readProcessStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  return readBoundedStdin(
    process.stdin as AsyncIterable<Buffer | string>,
    stdinReadLimitsFromEnv(),
    (error) => process.stdin.destroy(error)
  );
}
