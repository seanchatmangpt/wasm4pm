/**
 * Output layer — the mechanism that kills wpm defect 3 ("--json prints
 * human text to stdout") BY CONSTRUCTION.
 *
 * Contract:
 *   - stdout ALWAYS receives exactly one JSON value: either the verb's
 *     plain result, or an `ErrorEnvelope`. Nothing else is ever written
 *     to stdout by the framework. `JSON.parse(stdout)` always works,
 *     unconditionally — `--human` does not change this.
 *   - `--human` ADDITIONALLY renders a friendly view to STDERR. A human
 *     watching the terminal sees both streams interleaved; a script
 *     capturing only stdout (`wpm ... | jq`) is unaffected either way.
 *   - Handlers never call this module directly — only `buildCli()`'s
 *     generated `run()` wrapper does, exactly once per invocation.
 */

import type { VerbContext } from './types.js';

/** Write a single JSON value to stdout as the canonical machine-readable result. */
export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Write human-readable text to stderr. Never touches stdout. */
export function writeHumanToStderr(text: string): void {
  process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
}

/**
 * Fallback formatter used for `--human` when a verb doesn't supply its
 * own `human` renderer. Renders top-level object keys as `key: value`
 * lines; falls back to `String(value)` for scalars/arrays.
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

/** Print the `[experimental]` banner for lab/experimental verbs, to stderr. */
export function writeExperimentalBanner(ctx: VerbContext): void {
  process.stderr.write(
    `[experimental] '${ctx.noun} ${ctx.verb}' is experimental and may change or be removed without notice.\n`
  );
}
