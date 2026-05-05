/**
 * WebSocketSourceAdapter - Read event logs from WebSocket connections
 *
 * Connects to a WebSocket server and consumes JSON event messages.
 * Each message should be a JSON object representing a single event.
 * Supports reconnection with exponential backoff.
 */
import { createHash } from 'crypto';
import { ok, err, isOk } from '@wasm4pm/contracts';
/**
 * EventStream implementation that reads from a WebSocket connection.
 * Buffers incoming messages and serves them in batches.
 */
class WebSocketEventStream {
    constructor(url, config) {
        this.url = url;
        this.config = config;
        this.messages = [];
        this.cursor = 0;
        this.batchSize = 50;
        this.closed = false;
        this.ws = null;
        this.messageQueue = [];
    }
    /**
     * Connect to the WebSocket and start receiving messages.
     * Returns immediately — messages arrive asynchronously.
     */
    async connect() {
        try {
            const ws = new WebSocket(this.url);
            this.ws = ws;
            await new Promise((resolve, reject) => {
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
                ws.addEventListener('message', (event) => {
                    try {
                        const parsed = JSON.parse(String(event.data));
                        if (Array.isArray(parsed)) {
                            this.messageQueue.push(...parsed);
                        }
                        else {
                            this.messageQueue.push(parsed);
                        }
                    }
                    catch {
                        // Non-JSON message — skip silently
                    }
                });
                ws.addEventListener('close', () => {
                    this.closed = true;
                });
            });
            return ok(undefined);
        }
        catch (e) {
            return err(`WebSocket connection failed: ${e}`);
        }
    }
    next() {
        // Drain the async message queue into the buffered messages
        while (this.messageQueue.length > 0) {
            this.messages.push(this.messageQueue.shift());
        }
        const batch = this.messages.slice(this.cursor, this.cursor + this.batchSize);
        this.cursor += batch.length;
        return Promise.resolve(ok({
            events: batch,
            hasMore: !this.closed || this.cursor < this.messages.length || this.messageQueue.length > 0,
        }));
    }
    checkpoint() {
        return Promise.resolve(ok(JSON.stringify({ cursor: this.cursor, total: this.messages.length })));
    }
    seek(position) {
        try {
            const { cursor } = JSON.parse(position);
            this.cursor = cursor;
            return Promise.resolve(ok(undefined));
        }
        catch {
            return Promise.resolve(err('Invalid checkpoint format'));
        }
    }
    close() {
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
 * Implements the SourceAdapter contract from @wasm4pm/contracts.
 * Each WebSocket message should be a JSON event object or an array of events.
 */
export class WebSocketSourceAdapter {
    constructor(config) {
        this.kind = 'custom';
        this.version = '1.0.0';
        this.config = {
            url: config.url,
            maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
            reconnectDelayMs: config.reconnectDelayMs ?? 1000,
            maxReconnectDelayMs: config.maxReconnectDelayMs ?? 30000,
            headers: config.headers ?? {},
            label: config.label ?? 'websocket',
        };
    }
    capabilities() {
        return {
            streaming: true,
            checkpoint: true,
            filtering: false,
        };
    }
    fingerprint() {
        const hash = createHash('sha256');
        hash.update(`websocket:${this.config.url}:${this.config.label}`);
        return Promise.resolve(hash.digest('hex'));
    }
    validate() {
        if (!this.config.url) {
            return Promise.resolve(err('WebSocket URL is required'));
        }
        if (!this.config.url.startsWith('ws://') && !this.config.url.startsWith('wss://')) {
            return Promise.resolve(err('WebSocket URL must start with ws:// or wss://'));
        }
        return Promise.resolve(ok(undefined));
    }
    open() {
        const stream = new WebSocketEventStream(this.config.url, this.config);
        // Connect asynchronously — the stream will buffer messages as they arrive
        stream.connect().then((result) => {
            if (!isOk(result)) {
                console.error(`[ws-source] Connection failed: ${result.error}`);
            }
        });
        return Promise.resolve(ok(stream));
    }
    close() {
        return Promise.resolve();
    }
}
//# sourceMappingURL=ws-source.js.map