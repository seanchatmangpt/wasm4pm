/**
 * Mock SourceAdapter for testing without real file/network I/O.
 */

export type SourceAdapterKind = 'file' | 'http' | 'stream' | 'inline' | 'mock';

export interface Capabilities {
  streaming: boolean;
  random_access: boolean;
  watch: boolean;
  formats: string[];
}

export interface Result<T> {
  type: 'ok' | 'err';
  value?: T;
  error?: string;
}

function ok<T>(value: T): Result<T> {
  return { type: 'ok', value };
}

function err<T>(error: string): Result<T> {
  return { type: 'err', error };
}

export interface MockSourceOptions {
  kind?: SourceAdapterKind;
  data?: string;
  fingerprint?: string;
  shouldFailValidate?: boolean;
  shouldFailOpen?: boolean;
  validateDelay?: number;
  openDelay?: number;
  capabilities?: Partial<Capabilities>;
}

export class MockSourceAdapter {
  readonly kind: SourceAdapterKind;
  readonly version = '1.0.0-mock';
  readonly auth = undefined;

  private _data: string;
  private _fingerprint: string;
  private _shouldFailValidate: boolean;
  private _shouldFailOpen: boolean;
  private _validateDelay: number;
  private _openDelay: number;
  private _capabilities: Capabilities;
  private _opened = false;
  private _closed = false;

  /** Track calls for assertion */
  readonly calls: { method: string; timestamp: number; args?: unknown[] }[] = [];

  constructor(options: MockSourceOptions = {}) {
    this.kind = options.kind ?? 'mock';
    this._data = options.data ?? '{"traces":[]}';
    this._fingerprint = options.fingerprint ?? 'mock-fingerprint-abc123';
    this._shouldFailValidate = options.shouldFailValidate ?? false;
    this._shouldFailOpen = options.shouldFailOpen ?? false;
    this._validateDelay = options.validateDelay ?? 0;
    this._openDelay = options.openDelay ?? 0;
    this._capabilities = {
      streaming: false,
      random_access: false,
      watch: false,
      formats: ['json', 'xes'],
      ...options.capabilities,
    };
  }

  capabilities(): Capabilities {
    this.calls.push({ method: 'capabilities', timestamp: Date.now() });
    return this._capabilities;
  }

  async fingerprint(): Promise<string> {
    this.calls.push({ method: 'fingerprint', timestamp: Date.now() });
    return this._fingerprint;
  }

  async validate(): Promise<Result<void>> {
    this.calls.push({ method: 'validate', timestamp: Date.now() });
    if (this._validateDelay > 0) {
      await delay(this._validateDelay);
    }
    if (this._shouldFailValidate) {
      return err('Mock validation failure');
    }
    return ok(undefined);
  }

  async open(): Promise<Result<{ data: string }>> {
    this.calls.push({ method: 'open', timestamp: Date.now() });
    if (this._openDelay > 0) {
      await delay(this._openDelay);
    }
    if (this._shouldFailOpen) {
      return err('Mock open failure');
    }
    this._opened = true;
    return ok({ data: this._data });
  }

  async close(): Promise<void> {
    this.calls.push({ method: 'close', timestamp: Date.now() });
    this._closed = true;
  }

  /** Assert that methods were called in expected order */
  assertCallOrder(expectedOrder: string[]): void {
    const actual = this.calls.map(c => c.method);
    for (let i = 0; i < expectedOrder.length; i++) {
      if (actual[i] !== expectedOrder[i]) {
        throw new Error(
          `Call order mismatch at index ${i}: expected '${expectedOrder[i]}', got '${actual[i] ?? 'undefined'}'. Full order: [${actual.join(', ')}]`,
        );
      }
    }
  }

  get isOpened(): boolean { return this._opened; }
  get isClosed(): boolean { return this._closed; }

  reset(): void {
    this.calls.length = 0;
    this._opened = false;
    this._closed = false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createMockSource(options?: MockSourceOptions): MockSourceAdapter {
  return new MockSourceAdapter(options);
}
