/**
 * WebSocketSourceAdapter - Read event logs from WebSocket connections
 *
 * Connects to a WebSocket server and consumes JSON event messages.
 * Each message should be a JSON object representing a single event.
 * Supports reconnection with exponential backoff.
 */
import {
  SourceAdapter,
  Capabilities,
  EventStream,
  Result,
  SourceAdapterKind,
} from '@wasm4pm/contracts';
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
 * WebSocketSourceAdapter — reads event data from a WebSocket server.
 *
 * Implements the SourceAdapter contract from @wasm4pm/contracts.
 * Each WebSocket message should be a JSON event object or an array of events.
 */
export declare class WebSocketSourceAdapter implements SourceAdapter {
  readonly kind: SourceAdapterKind;
  readonly version = '1.0.0';
  private config;
  constructor(config: WebSocketSourceConfig);
  capabilities(): Capabilities;
  fingerprint(): Promise<string>;
  validate(): Promise<Result<void>>;
  open(): Promise<Result<EventStream>>;
  close(): Promise<void>;
}
//# sourceMappingURL=ws-source.d.ts.map
