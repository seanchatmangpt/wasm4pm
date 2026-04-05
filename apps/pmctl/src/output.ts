import { consola } from 'consola';

/**
 * Output formatter for human-readable and JSON modes
 */
export interface OutputOptions {
  format?: 'human' | 'json';
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Human-readable formatter using consola
 */
export class HumanFormatter {
  private verbose: boolean;
  private quiet: boolean;

  constructor(options: OutputOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.quiet = options.quiet ?? false;
  }

  success(message: string): void {
    if (!this.quiet) {
      consola.success(message);
    }
  }

  info(message: string): void {
    if (!this.quiet) {
      consola.info(message);
    }
  }

  warn(message: string): void {
    consola.warn(message);
  }

  error(message: string): void {
    consola.error(message);
  }

  debug(message: string): void {
    if (this.verbose) {
      consola.log(`[DEBUG] ${message}`);
    }
  }

  box(message: string): void {
    if (!this.quiet) {
      consola.box(message);
    }
  }

  log(message: string, data?: Record<string, unknown>): void {
    if (!this.quiet) {
      consola.log(message, data ?? '');
    }
  }
}

/**
 * JSON formatter for machine-readable output
 */
export class JSONFormatter {
  private quiet: boolean;

  constructor(options: OutputOptions = {}) {
    this.quiet = options.quiet ?? false;
  }

  output(data: Record<string, unknown>): void {
    if (!this.quiet) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  success(message: string, data?: Record<string, unknown>): void {
    if (!this.quiet) {
      this.output({
        status: 'success',
        message,
        ...(data ?? {}),
      });
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

  warn(message: string, data?: Record<string, unknown>): void {
    if (!this.quiet) {
      this.output({
        status: 'warning',
        message,
        ...(data ?? {}),
      });
    }
  }
}

/**
 * Streaming output handler for watch mode
 */
export class StreamingOutput {
  private format: 'human' | 'json';
  private humanFormatter: HumanFormatter;
  private jsonFormatter: JSONFormatter;

  constructor(options: OutputOptions = {}) {
    this.format = options.format ?? 'human';
    this.humanFormatter = new HumanFormatter(options);
    this.jsonFormatter = new JSONFormatter(options);
  }

  startStream(): void {
    if (this.format === 'human') {
      this.humanFormatter.info('Watching for changes...');
    }
  }

  emitEvent(eventType: string, data: Record<string, unknown>): void {
    if (this.format === 'json') {
      this.jsonFormatter.output({
        type: eventType,
        timestamp: new Date().toISOString(),
        ...data,
      });
    } else {
      this.humanFormatter.log(`[${eventType}] ${JSON.stringify(data)}`);
    }
  }

  endStream(): void {
    if (this.format === 'human') {
      this.humanFormatter.info('Watch mode ended');
    }
  }
}

/**
 * Get formatter instance based on format option
 */
export function getFormatter(options: OutputOptions = {}) {
  if (options.format === 'json') {
    return new JSONFormatter(options);
  }
  return new HumanFormatter(options);
}
