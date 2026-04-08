/**
 * HttpSourceAdapter - Fetch event logs from HTTP/HTTPS endpoints
 *
 * Supports JSON and XES responses. Implements retry with exponential
 * backoff for transient network failures.
 */

import { createHash } from 'crypto';
import {
  SourceAdapter,
  Capabilities,
  EventStream,
  Result,
  SourceAdapterKind,
  RetryStrategy,
  AuthConfig,
  AuthType,
} from '@pictl/contracts';
import { ok, err, error } from '@pictl/contracts';
import { createError } from '@pictl/contracts';

/**
 * Configuration for HttpSourceAdapter
 */
export interface HttpSourceConfig {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  auth?: {
    type: AuthType;
    token?: string;
    username?: string;
    password?: string;
  };
}

/**
 * Bearer token authentication config
 */
class BearerAuthConfig implements AuthConfig {
  type: AuthType = 'bearer';
  constructor(private token: string) {}

  async validate(): Promise<Result<void>> {
    if (!this.token || this.token.trim().length === 0) {
      return err('Bearer token is empty');
    }
    return ok(undefined);
  }

  getHeader(): string {
    return `Bearer ${this.token}`;
  }
}

/**
 * Basic authentication config
 */
class BasicAuthConfig implements AuthConfig {
  type: AuthType = 'basic';
  constructor(
    private username: string,
    private password: string,
  ) {}

  async validate(): Promise<Result<void>> {
    if (!this.username) {
      return err('Username is required for basic auth');
    }
    return ok(undefined);
  }

  getHeader(): string {
    const encoded = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${encoded}`;
  }
}

/**
 * Event stream backed by an HTTP response body
 */
class HttpEventStream implements EventStream {
  private events: unknown[] = [];
  private cursor = 0;
  private closed = false;

  constructor(responseBody: string) {
    // Try parsing as JSON array or newline-delimited JSON
    const trimmed = responseBody.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        this.events = parsed;
      } else {
        this.events = [parsed];
      }
    } catch {
      // Try newline-delimited JSON
      this.events = trimmed
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line.trim());
          } catch {
            return null;
          }
        })
        .filter((e): e is unknown => e !== null);
    }
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
 * HttpSourceAdapter - Fetches event logs from HTTP endpoints
 *
 * Features:
 * - GET/POST support
 * - Bearer and Basic authentication
 * - Configurable timeout
 * - Retry with exponential backoff
 * - SHA256 fingerprinting for idempotency
 */
export class HttpSourceAdapter implements SourceAdapter {
  readonly kind: SourceAdapterKind = 'http';
  readonly version = '1.0.0';

  readonly retry: RetryStrategy = {
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelayMs: 500,
  };

  readonly auth?: AuthConfig;

  private config: Required<Omit<HttpSourceConfig, 'auth' | 'body'>> & {
    body?: string;
  };
  private stream?: HttpEventStream;

  constructor(config: HttpSourceConfig) {
    this.config = {
      method: 'GET',
      headers: {},
      timeoutMs: 30_000,
      ...config,
    };

    if (config.auth) {
      if (config.auth.type === 'bearer') {
        this.auth = new BearerAuthConfig(config.auth.token ?? '');
      } else if (config.auth.type === 'basic') {
        this.auth = new BasicAuthConfig(config.auth.username ?? '', config.auth.password ?? '');
      }
    }
  }

  capabilities(): Capabilities {
    return {
      streaming: false,
      checkpoint: true,
      filtering: false,
    };
  }

  async validate(): Promise<Result<void>> {
    try {
      new URL(this.config.url);
    } catch {
      return error(
        createError('SOURCE_INVALID', `Invalid URL: ${this.config.url}`, {
          url: this.config.url,
        }),
      );
    }

    if (this.auth) {
      const authResult = await this.auth.validate();
      if (authResult.type !== 'ok') {
        return authResult;
      }
    }

    return ok(undefined);
  }

  async fingerprint(source: unknown): Promise<string> {
    const configStr = JSON.stringify({
      url: this.config.url,
      method: this.config.method,
      headers: this.config.headers,
      source,
    });
    return createHash('sha256').update(configStr, 'utf-8').digest('hex');
  }

  async open(): Promise<Result<EventStream>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retry.maxAttempts; attempt++) {
      try {
        const headers: Record<string, string> = { ...this.config.headers };

        // Add auth header
        if (this.auth) {
          if (this.auth instanceof BearerAuthConfig) {
            headers['Authorization'] = this.auth.getHeader();
          } else if (this.auth instanceof BasicAuthConfig) {
            headers['Authorization'] = this.auth.getHeader();
          }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const fetchOptions: RequestInit = {
          method: this.config.method,
          headers,
          signal: controller.signal,
        };

        if (this.config.body && this.config.method === 'POST') {
          fetchOptions.body = this.config.body;
        }

        const response = await fetch(this.config.url, fetchOptions);
        clearTimeout(timeout);

        if (!response.ok) {
          const statusText = response.statusText || `HTTP ${response.status}`;
          if (response.status >= 500) {
            // Server error, retryable
            lastError = new Error(`Server error: ${statusText}`);
            if (attempt < this.retry.maxAttempts - 1) {
              const delayMs = this.retry.initialDelayMs * Math.pow(2, attempt);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            continue;
          }

          // Client error, not retryable
          return error(
            createError('SOURCE_INVALID', `HTTP ${response.status}: ${statusText}`, {
              url: this.config.url,
              status: response.status,
            }),
          );
        }

        const body = await response.text();
        this.stream = new HttpEventStream(body);
        return ok(this.stream);
      } catch (e) {
        lastError = e as Error;

        if ((e as Error).name === 'AbortError') {
          return error(
            createError('SOURCE_INVALID', `Request timed out after ${this.config.timeoutMs}ms`, {
              url: this.config.url,
              timeoutMs: this.config.timeoutMs,
            }),
          );
        }

        if (attempt < this.retry.maxAttempts - 1) {
          const delayMs = this.retry.initialDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    return error(
      createError(
        'SOURCE_NOT_FOUND',
        `Failed to fetch after ${this.retry.maxAttempts} retries: ${lastError?.message}`,
        { url: this.config.url, attempts: this.retry.maxAttempts },
      ),
    );
  }

  async close(): Promise<void> {
    if (this.stream) {
      await this.stream.close();
      this.stream = undefined;
    }
  }
}
