import { consola } from 'consola';
import { randomUUID } from 'node:crypto';
import pkg from '../package.json' with { type: 'json' };
import { getQuickRecoverySuggestion } from './error-recovery.js';

// ─── Canonical output types ───────────────────────────────────────────────────
// Every command builds CommandResult<T> first.
// emitResult() dispatches to the correct projection (json | sarif | jsonl | human).
// No control decision may depend on human-formatted output.

/** Canonical result — every command builds this before any output */
export interface CommandResult<T = unknown> {
  readonly command: string; // e.g. 'run', 'benchmark verify'
  readonly status: 'ok' | 'error';
  readonly exit_code: number; // EXIT_CODES value
  readonly payload: T;
  readonly error?: {
    readonly code: string; // machine-readable
    readonly message: string;
    readonly remediation?: string;
  };
  readonly meta: {
    readonly run_id: string; // UUID v4
    readonly timestamp: string; // ISO-8601
    readonly duration_ms: number;
    readonly version: string;
  };
}

/** Emit options — replaces OutputOptions for the canonical path */
export interface EmitOptions {
  format: 'json' | 'sarif' | 'jsonl' | 'human';
  verbose?: boolean;
  quiet?: boolean;
}

/** Console renderer — commands with rich human output provide this */
export type ConsoleRenderer<T = unknown> = (
  result: CommandResult<T>,
  projection: ConsoleProjection
) => void;

/**
 * Single output function — all commands call this once after building their result.
 * consoleRenderer is optional; if omitted, defaultConsoleRenderer is used.
 */
export function emitResult<T>(
  result: CommandResult<T>,
  options: EmitOptions,
  consoleRenderer?: ConsoleRenderer<T>
): void {
  if (options.quiet && options.format !== 'json' && options.format !== 'sarif') {
    return;
  }

  switch (options.format) {
    case 'json':
      if (!options.quiet) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      }
      break;

    case 'jsonl':
      if (!options.quiet) {
        process.stdout.write(JSON.stringify(result) + '\n');
      }
      break;

    case 'sarif':
      // Commands that produce SARIF findings emit via sarif.ts helpers.
      // Default: wrap the result in a minimal SARIF 2.1.0 envelope.
      if (!options.quiet) {
        process.stdout.write(buildMinimalSarif(result) + '\n');
      }
      break;

    case 'human':
    default:
      if (!options.quiet) {
        const projection = new ConsoleProjection(options);
        if (consoleRenderer) {
          consoleRenderer(result, projection);
        } else {
          defaultConsoleRenderer(result, projection, options);
        }
      }
      break;
  }
}

function buildMinimalSarif<T>(result: CommandResult<T>): string {
  const level = result.status === 'ok' ? 'none' : 'error';
  return JSON.stringify(
    {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: { driver: { name: 'wpm', version: result.meta.version } },
          results:
            result.status === 'error'
              ? [
                  {
                    ruleId: 'WPM001',
                    level,
                    message: { text: result.error?.message ?? 'command failed' },
                  },
                ]
              : [],
        },
      ],
    },
    null,
    2
  );
}

function defaultConsoleRenderer<T>(
  result: CommandResult<T>,
  projection: ConsoleProjection,
  options: EmitOptions
): void {
  if (result.status === 'ok') {
    projection.success(`${result.command} completed in ${result.meta.duration_ms.toFixed(0)}ms`);
    if (options.verbose && result.payload !== null && result.payload !== undefined) {
      projection.info(JSON.stringify(result.payload, null, 2));
    }
  } else {
    projection.error(result.error?.message ?? 'Command failed');
    if (result.error?.remediation) {
      projection.info(`Remediation: ${result.error.remediation}`);
    }
  }
}

/** Build a successful CommandResult */
export function makeResult<T>(
  command: string,
  payload: T,
  durationMs: number,
  exitCode = 0
): CommandResult<T> {
  return {
    command,
    status: 'ok',
    exit_code: exitCode,
    payload,
    meta: {
      run_id: randomUUID(),
      timestamp: new Date().toISOString(),
      duration_ms: Math.round(durationMs),
      version: pkg.version ?? '0.0.0',
    },
  };
}

/**
 * Redact sensitive filesystem paths from error messages.
 * Replaces absolute paths with generic descriptions to prevent information leakage.
 *
 * @param message - The error message potentially containing paths
 * @returns Sanitized message with paths redacted
 */
function redactPathsFromError(message: string): string {
  // Replace common absolute paths with generic descriptions
  // /home/user/* → "<home>"
  // /Users/* → "<home>"
  // /root/* → "<home>"
  const redacted = message
    .replace(/\/home\/[^/]+\//g, '<home>/')
    .replace(/\/Users\/[^/]+\//g, '<home>/')
    .replace(/\/root\//g, '<home>/')
    // Also redact explicit filesystem paths at boundaries
    .replace(/\/home\/[^/\s]+/g, '<home>')
    .replace(/\/Users\/[^/\s]+/g, '<home>')
    .replace(/\/root[^\s]*/g, '<home>')
    // Redact .wasm4pm directory paths (show only relative)
    .replace(/\.wasm4pm\/[a-zA-Z0-9\-_.]+\//g, '.wasm4pm/<file>/')
    // Redact /etc paths
    .replace(/\/etc\/[^\s]+/g, '<system-file>');

  return redacted;
}

/**
 * Build an error CommandResult.
 * Automatically generates recovery suggestions if not provided.
 */
export function makeErrorResult(
  command: string,
  err: unknown,
  exitCode: number,
  code = 'COMMAND_ERROR',
  remediation?: string
): CommandResult<null> {
  let message = err instanceof Error ? err.message : String(err);

  // Security: redact filesystem paths from error messages
  message = redactPathsFromError(message);

  // Auto-generate recovery suggestion if not provided
  let finalRemediation = remediation;
  if (!finalRemediation) {
    try {
      const errorType = codeToErrorType(code);
      if (errorType) {
        finalRemediation = getQuickRecoverySuggestion(message, errorType);
      }
    } catch {
      // If recovery hint generation fails, use no remediation
    }
  }

  return {
    command,
    status: 'error',
    exit_code: exitCode,
    payload: null,
    error: { code, message, remediation: finalRemediation },
    meta: {
      run_id: randomUUID(),
      timestamp: new Date().toISOString(),
      duration_ms: 0,
      version: pkg.version ?? '0.0.0',
    },
  };
}

/**
 * Map error code string to error type for recovery hint generation.
 */
function codeToErrorType(code: string): 'config' | 'source' | 'execution' | 'system' | undefined {
  if (code.includes('CONFIG')) return 'config';
  if (code.includes('SOURCE')) return 'source';
  if (code.includes('EXECUTION') || code.includes('WASM')) return 'execution';
  if (code.includes('SYSTEM')) return 'system';
  return undefined;
}

// ─── ConsoleProjection ────────────────────────────────────────────────────────
// Non-authoritative console display. Human readability is NOT the output contract.
// Use emitResult() + a ConsoleRenderer for all command output.

export class ConsoleProjection {
  readonly verbose: boolean;
  readonly quiet: boolean;

  constructor(options: { verbose?: boolean; quiet?: boolean } = {}) {
    this.verbose = options.verbose ?? false;
    this.quiet = options.quiet ?? false;
  }

  success(message: string): void {
    if (!this.quiet) consola.success(message);
  }

  info(message: string): void {
    if (!this.quiet) consola.info(message);
  }

  warn(message: string): void {
    consola.warn(message);
  }

  error(message: string): void {
    consola.error(message);
  }

  debug(message: string): void {
    if (this.verbose) consola.log(`[DEBUG] ${message}`);
  }

  box(message: string): void {
    if (!this.quiet) consola.box(message);
  }

  log(message: string, data?: Record<string, unknown>): void {
    if (!this.quiet) {
      if (data && Object.keys(data).length > 0) {
        console.log(message, data);
      } else {
        console.log(message);
      }
    }
  }
}

// ─── Backward-compat (deprecated) ────────────────────────────────────────────
// These remain for the duration of the migration. New code must use
// CommandResult<T> + emitResult(). Do not add new callers.

/** @deprecated Use CommandResult<T> + emitResult() instead */
export interface OutputOptions {
  format?: 'human' | 'json';
  verbose?: boolean;
  quiet?: boolean;
}

/** @deprecated Use ConsoleProjection instead */
export class HumanFormatter extends ConsoleProjection {
  constructor(options: OutputOptions = {}) {
    super(options);
  }
}

/** @deprecated Internal to emitResult(). Do not use in new code. */
export class JSONFormatter {
  private quiet: boolean;

  constructor(options: OutputOptions = {}) {
    this.quiet = options.quiet ?? false;
  }

  output(data: Record<string, unknown>): void {
    if (!this.quiet) console.log(JSON.stringify(data, null, 2));
  }

  success(message: string, data?: unknown): void {
    if (!this.quiet) {
      const normalizedData = Array.isArray(data)
        ? { data }
        : ((data as Record<string, unknown>) ?? {});
      this.output({ status: 'success', message, ...normalizedData });
    }
  }

  error(message: string, error?: unknown): void {
    this.output({
      status: 'error',
      message,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }

  warn(message: string, data?: unknown): void {
    if (!this.quiet) {
      const normalizedData = Array.isArray(data)
        ? { data }
        : ((data as Record<string, unknown>) ?? {});
      this.output({ status: 'warning', message, ...normalizedData });
    }
  }
}

/** @deprecated Use emitResult() instead */
export function getFormatter(options: OutputOptions = {}): HumanFormatter | JSONFormatter {
  if (options.format === 'json') {
    return new JSONFormatter(options);
  }
  return new HumanFormatter(options);
}

/**
 * Render a watch event as a human-readable string.
 *
 * For machine pipelines, callers should use --format json which bypasses this
 * function entirely (raw JSON line per event). In human mode the practitioner
 * should never have to parse JSON from the terminal.
 */
function renderWatchEvent(eventType: string, data: Record<string, unknown>): string {
  const ts = new Date().toISOString().slice(11, 19); // HH:MM:SS
  switch (eventType) {
    case 'watching': {
      const count = data['files_count'] ?? 1;
      const p = data['path'] ?? data['message'] ?? '';
      return `[${ts}] Watching ${count} file(s) in ${p} — press Ctrl+C to stop`;
    }
    case 'change_detected': {
      const file = data['file'] ?? '';
      const mtime = data['mtime'] ?? '';
      const cycle = data['cycle'] != null ? ` (cycle #${data['cycle']})` : '';
      return `[${ts}] Change detected${cycle}: ${file}  (modified ${mtime})`;
    }
    case 'config_changed': {
      const changes = data['changes'];
      if (Array.isArray(changes) && changes.length > 0) {
        const lines = (changes as Array<{ summary?: string }>)
          .map((c) => `        ${c.summary ?? JSON.stringify(c)}`)
          .join('\n');
        return `[${ts}] Config changed — re-running discovery:\n${lines}`;
      }
      return `[${ts}] Config changed — re-running discovery`;
    }
    case 'config_unchanged':
      return `[${ts}] File saved but effective config unchanged — re-running anyway`;
    case 'processing_started':
      return `[${ts}] Discovery started (plan ${data['planId'] ?? ''}, ${data['steps'] ?? 0} step(s))`;
    case 'processing_completed':
      return `[${ts}] Discovery completed`;
    case 'autopilot_selected':
      return `[${ts}] Autopilot selected: ${data['algorithm']}  — ${data['rationale']}`;
    case 'autopilot_completed':
      return `[${ts}] Autopilot discovery done in ${data['elapsedMs']}ms`;
    case 'autopilot_error':
      return `[${ts}] Autopilot error: ${data['message']}`;
    case 'stopped':
      return `[${ts}] Watch stopped`;
    case 'error':
      return `[${ts}] Error (${data['code'] ?? 'WATCH_ERROR'}): ${data['message']}`;
    default:
      // Unknown event: render compactly but not as full JSON
      return `[${ts}] ${eventType}: ${Object.entries(data)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ')}`;
  }
}

/** Streaming output handler for watch/drift-watch mode (jsonl format) */
export class StreamingOutput {
  private format: 'human' | 'json';
  private projection: ConsoleProjection;
  private quiet: boolean;

  constructor(options: OutputOptions = {}) {
    this.format = options.format ?? 'human';
    this.projection = new ConsoleProjection(options);
    this.quiet = options.quiet ?? false;
  }

  startStream(): void {
    if (this.format === 'human') {
      this.projection.info('Watching for changes...');
    }
  }

  emitEvent(eventType: string, data: Record<string, unknown>): void {
    if (this.quiet) return;
    if (this.format === 'json') {
      console.log(
        JSON.stringify({ type: eventType, timestamp: new Date().toISOString(), ...data })
      );
    } else {
      this.projection.log(renderWatchEvent(eventType, data));
    }
  }

  endStream(): void {
    if (this.format === 'human') {
      this.projection.info('Watch mode ended');
    }
  }
}
