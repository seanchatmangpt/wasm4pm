import { consola } from 'consola';
/**
 * Human-readable formatter using consola
 */
export class HumanFormatter {
    constructor(options = {}) {
        this.verbose = options.verbose ?? false;
        this.quiet = options.quiet ?? false;
    }
    success(message) {
        if (!this.quiet) {
            consola.success(message);
        }
    }
    info(message) {
        if (!this.quiet) {
            consola.info(message);
        }
    }
    warn(message) {
        consola.warn(message);
    }
    error(message) {
        consola.error(message);
    }
    debug(message) {
        if (this.verbose) {
            consola.log(`[DEBUG] ${message}`);
        }
    }
    box(message) {
        if (!this.quiet) {
            consola.box(message);
        }
    }
    log(message, data) {
        if (!this.quiet) {
            // Use console.log directly for synchronous output that flushes with process.exit()
            // consola.log may buffer and not flush before process termination in test environments
            if (data && Object.keys(data).length > 0) {
                console.log(message, data);
            }
            else {
                console.log(message);
            }
        }
    }
}
/**
 * JSON formatter for machine-readable output
 */
export class JSONFormatter {
    constructor(options = {}) {
        this.quiet = options.quiet ?? false;
    }
    output(data) {
        if (!this.quiet) {
            console.log(JSON.stringify(data, null, 2));
        }
    }
    success(message, data) {
        if (!this.quiet) {
            this.output({
                status: 'success',
                message,
                ...(data ?? {}),
            });
        }
    }
    error(message, error) {
        this.output({
            status: 'error',
            message,
            error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        });
    }
    warn(message, data) {
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
    constructor(options = {}) {
        this.format = options.format ?? 'human';
        this.humanFormatter = new HumanFormatter(options);
        this.jsonFormatter = new JSONFormatter(options);
    }
    startStream() {
        if (this.format === 'human') {
            this.humanFormatter.info('Watching for changes...');
        }
    }
    emitEvent(eventType, data) {
        if (this.format === 'json') {
            this.jsonFormatter.output({
                type: eventType,
                timestamp: new Date().toISOString(),
                ...data,
            });
        }
        else {
            this.humanFormatter.log(`[${eventType}] ${JSON.stringify(data)}`);
        }
    }
    endStream() {
        if (this.format === 'human') {
            this.humanFormatter.info('Watch mode ended');
        }
    }
}
/**
 * Get formatter instance based on format option
 */
export function getFormatter(options = {}) {
    if (options.format === 'json') {
        return new JSONFormatter(options);
    }
    return new HumanFormatter(options);
}
//# sourceMappingURL=output.js.map