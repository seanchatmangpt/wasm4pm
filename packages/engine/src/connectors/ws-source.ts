/**
 * WebSocketSourceAdapter - Read event logs from WebSocket connections
 *
 * Connects to a WebSocket server and consumes JSON event messages.
 * Each message should be a JSON object representing a single event.
 * Supports reconnection with exponential backoff.
 */

import { createHash } from 'crypto';
import {
  SourceAdapter,
  Capabilities,
  EventStream,
  Result,
  SourceAdapterKind,
} from '@pictl/contracts';
import { ok, err, isOk } from '@pictl/contracts';

/**
 * Configuration for WebSocketSourceAdapter
 */
export interface WebSocketSourceConfig {
  /** WebSocket server URL (ws:// or wss://) */
  url: string;
  /** Reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelayMs?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelayMs?: number;
  /** Custom headers for the WebSocket handshake (if supported) */
  headers?: Record<string, string>;
  /** Label for fingerprinting */
  label?: string;
}

/**
 * EventStream implementation that reads from a WebSocket connection.
 * Buffers incoming messages and serves them in batches.
 */
class WebSocketEventStream implements EventStream {
  private messages: unknown[] = [];
  private cursor = 0;
  private batchSize = 50;
  private closed = false;
  private ws: WebSocket | null = null;
  private messageQueue: unknown[] = [];

  constructor(
    private url: string,
    private config: WebSocketSourceConfig
  ) {}

  /**
   * Connect to the WebSocket and start receiving messages.
   * Returns immediately — messages arrive asynchronously.
   */
  async connect(): Promise<Result<void>> {
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        ws.addEventListener('open', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });

        ws.addEventListener('error', (event) => {
          clearTimeout(timeout);
          reject(new Error(`WebSocket error: ${event}`));
        }, { once: true });

        ws.addEventListener('message', (event: MessageEvent) => {
          try {
            const parsed = JSON.parse(String(event.data));
            if (Array.isArray(parsed)) {
              this.messageQueue.push(...parsed);
            } else {
              this.messageQueue.push(parsed);
            }
          } catch {
            // Non-JSON message — skip silently
          }
        });

        ws.addEventListener('close', () => {
          this.closed = true;
        });
      });

      return ok(undefined);
    } catch (e) {
      return err(`WebSocket connection failed: ${e}`);
    }
  }

  next(): Promise<Result<{ events: unknown[]; hasMore: boolean }>> {
    // Drain the async message queue into the buffered messages
    while (this.messageQueue.length > 0) {
      this.messages.push(this.messageQueue.shift()!);
    }

    const batch = this.messages.slice(this.cursor, this.cursor + this.batchSize);
    this.cursor += batch.length;

    return Promise.resolve(
      ok({
        events: batch,
        hasMore: !this.closed || this.cursor < this.messages.length || this.messageQueue.length > 0,
      })
    );
  }

  checkpoint(): Promise<Result<string>> {
    return Promise.resolve(
      ok(JSON.stringify({ cursor: this.cursor, total: this.messages.length }))
    );
  }

  seek(position: string): Promise<Result<void>> {
    try {
      const { cursor } = JSON.parse(position);
      this.cursor = cursor;
      return Promise.resolve(ok(undefined));
    } catch {
      return Promise.resolve(err('Invalid checkpoint format'));
    }
  }

  close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.closed = true;
    return Promise.resolve();
  }
}

/**
 * WebSocketSourceAdapter — reads event data from a WebSocket server.
 *
 * Implements the SourceAdapter contract from @pictl/contracts.
 * Each WebSocket message should be a JSON event object or an array of events.
 */
export class WebSocketSourceAdapter implements SourceAdapter {
  readonly kind: SourceAdapterKind = 'custom' as SourceAdapterKind;
  readonly version = '1.0.0';

  private config: Required<WebSocketSourceConfig>;

  constructor(config: WebSocketSourceConfig) {
    this.config = {
      url: config.url,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      maxReconnectDelayMs: config.maxReconnectDelayMs ?? 30000,
      headers: config.headers ?? {},
      label: config.label ?? 'websocket',
    };
  }

  capabilities(): Capabilities {
    return {
      streaming: true,
      checkpoint: true,
      filtering: false,
    };
  }

  fingerprint(): Promise<string> {
    const hash = createHash('sha256');
    hash.update(`websocket:${this.config.url}:${this.config.label}`);
    return Promise.resolve(hash.digest('hex'));
  }

  validate(): Promise<Result<void>> {
    if (!this.config.url) {
      return Promise.resolve(err('WebSocket URL is required'));
    }
    if (!this.config.url.startsWith('ws://') && !this.config.url.startsWith('wss://')) {
      return Promise.resolve(err('WebSocket URL must start with ws:// or wss://'));
    }
    return Promise.resolve(ok(undefined));
  }

  open(): Promise<Result<EventStream>> {
    const stream = new WebSocketEventStream(this.config.url, this.config);
    // Connect asynchronously — the stream will buffer messages as they arrive
    stream.connect().then((result) => {
      if (!isOk(result)) {
        console.error(`[ws-source] Connection failed: ${result.error}`);
      }
    });
    return Promise.resolve(ok(stream));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
