import { consola } from 'consola';
import { randomUUID } from 'node:crypto';
import pkg from '../package.json' assert { type: 'json' };

// ─── Canonical output types ───────────────────────────────────────────────────
// Every command builds CommandResult<T> first.
// emitResult() dispatches to the correct projection (json | sarif | jsonl | human).
// No control decision may depend on human-formatted output.

/** Canonical result — every command builds this before any output */
export interface CommandResult<T = unknown> {
  readonly command: string;        // e.g. 'run', 'benchmark verify'
  readonly status: 'ok' | 'error';
  readonly exit_code: number;      // EXIT_CODES value
  readonly payload: T;
  readonly error?: {
    readonly code: string;         // machine-readable
    readonly message: string;
    readonly remediation?: string;
  };
  readonly meta: {
    readonly run_id: string;       // UUID v4
    readonly timestamp: string;    // ISO-8601
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
          results: result.status === 'error'
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
    projection.success(
      `${result.command} completed in ${result.meta.duration_ms.toFixed(0)}ms`
    );
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

/** Build an error CommandResult */
export function makeErrorResult(
  command: string,
  err: unknown,
  exitCode: number,
  code = 'COMMAND_ERROR',
  remediation?: string
): CommandResult<null> {
  const message = err instanceof Error ? err.message : String(err);
  return {
    command,
    status: 'error',
    exit_code: exitCode,
    payload: null,
    error: { code, message, remediation },
    meta: {
      run_id: randomUUID(),
      timestamp: new Date().toISOString(),
      duration_ms: 0,
      version: pkg.version ?? '0.0.0',
    },
  };
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
      error:
        error instanceof Error ? { message: error.message, stack: error.stack } : error,
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
      console.log(JSON.stringify({ type: eventType, timestamp: new Date().toISOString(), ...data }));
    } else {
      this.projection.log(`[${eventType}] ${JSON.stringify(data)}`);
    }
  }

  endStream(): void {
    if (this.format === 'human') {
      this.projection.info('Watch mode ended');
    }
  }
}
