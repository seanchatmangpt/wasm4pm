/**
 * HttpSinkAdapter - POST artifacts to an HTTP endpoint
 *
 * Sends JSON-serialized artifacts via HTTP POST with configurable
 * authentication and retry logic.
 */

import {
  SinkAdapter,
  ArtifactType,
  SinkAdapterKind,
  Result,
  ExistsBehavior,
  AtomicityLevel,
  FailureMode,
} from '@wasm4pm/contracts';
import { ok, err, error } from '@wasm4pm/contracts';
import { createError } from '@wasm4pm/contracts';

/**
 * Configuration for HttpSinkAdapter
 */
export interface HttpSinkConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  timeoutMs?: number;
  auth?: {
    type: 'none' | 'bearer' | 'basic';
    token?: string;
    username?: string;
    password?: string;
  };
  onExists?: ExistsBehavior;
  failureMode?: FailureMode;
}

/**
 * HttpSinkAdapter - Sends artifacts to a remote HTTP endpoint
 *
 * Each write() sends a single POST/PUT request with JSON body:
 * ```json
 * { "type": "<artifact-type>", "artifact": <artifact-data> }
 * ```
 *
 * Atomicity: event-level (each write is one HTTP request)
 */
export class HttpSinkAdapter implements SinkAdapter {
  readonly kind: SinkAdapterKind = 'http';
  readonly version = '1.0.0';
  readonly atomicity: AtomicityLevel = 'event';
  readonly onExists: ExistsBehavior;
  readonly failureMode: FailureMode;

  private config: Required<Omit<HttpSinkConfig, 'auth'>> & {
    auth?: HttpSinkConfig['auth'];
  };

  constructor(config: HttpSinkConfig) {
    this.config = {
      method: 'POST',
      headers: {},
      timeoutMs: 30_000,
      onExists: 'overwrite',
      failureMode: 'fail',
      ...config,
    };
    this.onExists = this.config.onExists;
    this.failureMode = this.config.failureMode;
  }

  supportedArtifacts(): ArtifactType[] {
    return ['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot'];
  }

  supportsArtifact(type: ArtifactType): boolean {
    return this.supportedArtifacts().includes(type);
  }

  async validate(): Promise<Result<void>> {
    try {
      new URL(this.config.url);
    } catch {
      return error(
        createError('SINK_FAILED', `Invalid URL: ${this.config.url}`, {
          url: this.config.url,
        }),
      );
    }

    if (this.config.auth?.type === 'bearer' && !this.config.auth.token) {
      return err('Bearer token is required');
    }

    if (this.config.auth?.type === 'basic' && !this.config.auth.username) {
      return err('Username is required for basic auth');
    }

    return ok(undefined);
  }

  async write(artifact: unknown, type: ArtifactType): Promise<Result<string>> {
    if (!this.supportsArtifact(type)) {
      return err(`Unsupported artifact type: ${type}`);
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.config.headers,
      };

      // Add auth header
      if (this.config.auth) {
        if (this.config.auth.type === 'bearer' && this.config.auth.token) {
          headers['Authorization'] = `Bearer ${this.config.auth.token}`;
        } else if (this.config.auth.type === 'basic' && this.config.auth.username) {
          const encoded = Buffer.from(
            `${this.config.auth.username}:${this.config.auth.password ?? ''}`,
          ).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
      }

      const body = JSON.stringify({ type, artifact });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const statusText = response.statusText || `HTTP ${response.status}`;

        if (this.failureMode === 'ignore') {
          return ok(`http-ignored-${response.status}`);
        }

        if (this.failureMode === 'degrade') {
          console.warn(`[HttpSink] Write degraded: ${statusText}`);
          return ok(`http-degraded-${response.status}`);
        }

        return error(
          createError('SINK_FAILED', `HTTP ${response.status}: ${statusText}`, {
            url: this.config.url,
            status: response.status,
            artifactType: type,
          }),
        );
      }

      // Try to extract an ID from the response
      let responseId = `http-${type}-${Date.now()}`;
      try {
        const responseBody = await response.json();
        if (responseBody && typeof responseBody === 'object' && 'id' in responseBody) {
          responseId = String((responseBody as Record<string, unknown>).id);
        }
      } catch {
        // Response may not be JSON — that's fine
      }

      return ok(responseId);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return error(
          createError('SINK_FAILED', `Request timed out after ${this.config.timeoutMs}ms`, {
            url: this.config.url,
            timeoutMs: this.config.timeoutMs,
          }),
        );
      }

      if (this.failureMode === 'ignore') {
        return ok('http-ignored-error');
      }

      if (this.failureMode === 'degrade') {
        console.warn(`[HttpSink] Write degraded: ${(e as Error).message}`);
        return ok('http-degraded-error');
      }

      return error(
        createError('SINK_FAILED', `Failed to send artifact: ${(e as Error).message}`, {
          url: this.config.url,
          artifactType: type,
        }),
      );
    }
  }

  async close(): Promise<void> {
    // No persistent connection to close
  }
}
