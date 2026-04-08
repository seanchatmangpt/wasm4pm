/**
 * StreamSourceAdapter - Read event logs from ReadableStreams or stdin
 *
 * Supports reading newline-delimited JSON from any Node.js Readable stream
 * or process.stdin for piped input.
 */

import { createHash } from 'crypto';
import type { Readable } from 'stream';
import {
  SourceAdapter,
  Capabilities,
  EventStream,
  Result,
  SourceAdapterKind,
} from '@pictl/contracts';
import { ok, err, error } from '@pictl/contracts';
import { createError } from '@pictl/contracts';

/**
 * Configuration for StreamSourceAdapter
 */
export interface StreamSourceConfig {
  /** A Node.js Readable stream to consume. Defaults to process.stdin if omitted. */
  stream?: Readable;
  /** Label used in fingerprinting when no stream identity is available */
  label?: string;
}

/**
 * EventStream backed by a Readable (stdin, pipe, etc.)
 *
 * Buffers all content first, then serves batches — matches the
 * file-source pattern so callers get a uniform interface.
 */
class StreamEventStream implements EventStream {
  private events: unknown[] = [];
  private cursor = 0;
  private closed = false;

  constructor(content: string) {
    this.events = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((e): e is unknown => e !== null);
  }

  async next(): Promise<Result<{ events: unknown[]; hasMore: boolean }>> {
    if (this.closed) {
      return err('Stream is closed');
    }

    const batchSize = 100;
    const end = Math.min(this.cursor + batchSize, this.events.length);
    const batch = this.events.slice(this.cursor, end);
    this.cursor = end;

    return ok({ events: batch, hasMore: this.cursor < this.events.length });
  }

  async checkpoint(): Promise<Result<string>> {
    return ok(JSON.stringify({ cursor: this.cursor, total: this.events.length }));
  }

  async seek(position: string): Promise<Result<void>> {
    try {
      const pos = JSON.parse(position);
      if (typeof pos.cursor === 'number') {
        this.cursor = Math.min(pos.cursor, this.events.length);
        return ok(undefined);
      }
      return err('Invalid checkpoint format');
    } catch {
      return err('Failed to parse checkpoint');
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.events = [];
  }
}

/**
 * StreamSourceAdapter - Reads event logs from Readable streams
 *
 * Use cases:
 * - `echo '{"a":1}' | pictl run` (stdin pipe)
 * - Programmatic stream injection in tests or libraries
 *
 * Features:
 * - Reads until stream ends, then serves batches
 * - SHA256 fingerprinting via content hash
 * - Checkpoint / seek support
 */
export class StreamSourceAdapter implements SourceAdapter {
  readonly kind: SourceAdapterKind = 'stream';
  readonly version = '1.0.0';

  private config: StreamSourceConfig;
  private stream?: StreamEventStream;
  private bufferedContent?: string;

  constructor(config: StreamSourceConfig = {}) {
    this.config = config;
  }

  capabilities(): Capabilities {
    return {
      streaming: true,
      checkpoint: true,
      filtering: false,
    };
  }

  async validate(): Promise<Result<void>> {
    const readable = this.config.stream ?? process.stdin;

    if (!readable || typeof readable.on !== 'function') {
      return error(
        createError('SOURCE_INVALID', 'No readable stream available', {
          hasStream: !!this.config.stream,
        }),
      );
    }

    return ok(undefined);
  }

  async fingerprint(source: unknown): Promise<string> {
    const label = this.config.label ?? 'stdin';
    const sourceStr = JSON.stringify(source ?? {});
    const combined = `stream:${label}|${sourceStr}`;
    return createHash('sha256').update(combined, 'utf-8').digest('hex');
  }

  async open(): Promise<Result<EventStream>> {
    const readable = this.config.stream ?? process.stdin;

    try {
      const content = await this.readAll(readable);
      this.bufferedContent = content;

      if (content.trim().length === 0) {
        return error(
          createError('SOURCE_INVALID', 'Stream produced no data'),
        );
      }

      this.stream = new StreamEventStream(content);
      return ok(this.stream);
    } catch (e) {
      return error(
        createError('SOURCE_NOT_FOUND', `Failed to read stream: ${(e as Error).message}`),
      );
    }
  }

  async close(): Promise<void> {
    if (this.stream) {
      await this.stream.close();
      this.stream = undefined;
    }
    this.bufferedContent = undefined;
  }

  /**
   * Read entire stream into a string
   */
  private readAll(readable: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      readable.on('data', (chunk: Buffer | string) => {
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
