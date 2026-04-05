/**
 * StreamSourceAdapter - Read event logs from ReadableStreams or stdin
 *
 * Supports reading newline-delimited JSON from any Node.js Readable stream
 * or process.stdin for piped input.
 */
import { createHash } from 'crypto';
import { ok, err, error } from '@wasm4pm/contracts';
import { createError } from '@wasm4pm/contracts';
/**
 * EventStream backed by a Readable (stdin, pipe, etc.)
 *
 * Buffers all content first, then serves batches — matches the
 * file-source pattern so callers get a uniform interface.
 */
class StreamEventStream {
    constructor(content) {
        this.events = [];
        this.cursor = 0;
        this.closed = false;
        this.events = content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        })
            .filter((e) => e !== null);
    }
    async next() {
        if (this.closed) {
            return err('Stream is closed');
        }
        const batchSize = 100;
        const end = Math.min(this.cursor + batchSize, this.events.length);
        const batch = this.events.slice(this.cursor, end);
        this.cursor = end;
        return ok({ events: batch, hasMore: this.cursor < this.events.length });
    }
    async checkpoint() {
        return ok(JSON.stringify({ cursor: this.cursor, total: this.events.length }));
    }
    async seek(position) {
        try {
            const pos = JSON.parse(position);
            if (typeof pos.cursor === 'number') {
                this.cursor = Math.min(pos.cursor, this.events.length);
                return ok(undefined);
            }
            return err('Invalid checkpoint format');
        }
        catch {
            return err('Failed to parse checkpoint');
        }
    }
    async close() {
        this.closed = true;
        this.events = [];
    }
}
/**
 * StreamSourceAdapter - Reads event logs from Readable streams
 *
 * Use cases:
 * - `echo '{"a":1}' | pmctl run` (stdin pipe)
 * - Programmatic stream injection in tests or libraries
 *
 * Features:
 * - Reads until stream ends, then serves batches
 * - SHA256 fingerprinting via content hash
 * - Checkpoint / seek support
 */
export class StreamSourceAdapter {
    constructor(config = {}) {
        this.kind = 'stream';
        this.version = '1.0.0';
        this.config = config;
    }
    capabilities() {
        return {
            streaming: true,
            checkpoint: true,
            filtering: false,
        };
    }
    async validate() {
        const readable = this.config.stream ?? process.stdin;
        if (!readable || typeof readable.on !== 'function') {
            return error(createError('SOURCE_INVALID', 'No readable stream available', {
                hasStream: !!this.config.stream,
            }));
        }
        return ok(undefined);
    }
    async fingerprint(source) {
        const label = this.config.label ?? 'stdin';
        const sourceStr = JSON.stringify(source ?? {});
        const combined = `stream:${label}|${sourceStr}`;
        return createHash('sha256').update(combined, 'utf-8').digest('hex');
    }
    async open() {
        const readable = this.config.stream ?? process.stdin;
        try {
            const content = await this.readAll(readable);
            this.bufferedContent = content;
            if (content.trim().length === 0) {
                return error(createError('SOURCE_INVALID', 'Stream produced no data'));
            }
            this.stream = new StreamEventStream(content);
            return ok(this.stream);
        }
        catch (e) {
            return error(createError('SOURCE_NOT_FOUND', `Failed to read stream: ${e.message}`));
        }
    }
    async close() {
        if (this.stream) {
            await this.stream.close();
            this.stream = undefined;
        }
        this.bufferedContent = undefined;
    }
    /**
     * Read entire stream into a string
     */
    readAll(readable) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            readable.on('data', (chunk) => {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            });
            readable.on('end', () => {
                resolve(Buffer.concat(chunks).toString('utf-8'));
            });
            readable.on('error', (err) => {
                reject(err);
            });
        });
    }
}
//# sourceMappingURL=stream-source.js.map