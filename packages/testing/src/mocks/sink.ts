/**
 * Mock SinkAdapter for testing without real file/network I/O.
 */

export type ArtifactType = 'receipt' | 'model' | 'report' | 'snapshot' | 'log';
export type AtomicityLevel = 'none' | 'record' | 'batch' | 'all';
export type ExistsBehavior = 'overwrite' | 'append' | 'error' | 'skip';
export type FailureMode = 'fail_fast' | 'best_effort' | 'retry';

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

export interface MockSinkOptions {
  kind?: string;
  supportedArtifacts?: ArtifactType[];
  atomicity?: AtomicityLevel;
  onExists?: ExistsBehavior;
  failureMode?: FailureMode;
  shouldFailValidate?: boolean;
  shouldFailWrite?: boolean;
  failOnArtifactType?: ArtifactType;
  writeDelay?: number;
}

export interface WrittenArtifact {
  artifact: unknown;
  type: ArtifactType;
  timestamp: number;
  path: string;
}

export class MockSinkAdapter {
  readonly kind: string;
  readonly version = '1.0.0-mock';
  readonly atomicity: AtomicityLevel;
  readonly onExists: ExistsBehavior;
  readonly failureMode: FailureMode;

  private _supportedArtifacts: ArtifactType[];
  private _shouldFailValidate: boolean;
  private _shouldFailWrite: boolean;
  private _failOnArtifactType?: ArtifactType;
  private _writeDelay: number;
  private _closed = false;

  /** All artifacts written — inspect for assertions */
  readonly written: WrittenArtifact[] = [];

  /** Track calls for assertion */
  readonly calls: { method: string; timestamp: number; args?: unknown[] }[] = [];

  constructor(options: MockSinkOptions = {}) {
    this.kind = options.kind ?? 'mock';
    this._supportedArtifacts = options.supportedArtifacts ?? ['receipt', 'model', 'report', 'snapshot', 'log'];
    this.atomicity = options.atomicity ?? 'batch';
    this.onExists = options.onExists ?? 'overwrite';
    this.failureMode = options.failureMode ?? 'fail_fast';
    this._shouldFailValidate = options.shouldFailValidate ?? false;
    this._shouldFailWrite = options.shouldFailWrite ?? false;
    this._failOnArtifactType = options.failOnArtifactType;
    this._writeDelay = options.writeDelay ?? 0;
  }

  supportedArtifacts(): ArtifactType[] {
    this.calls.push({ method: 'supportedArtifacts', timestamp: Date.now() });
    return [...this._supportedArtifacts];
  }

  supportsArtifact(type: ArtifactType): boolean {
    this.calls.push({ method: 'supportsArtifact', timestamp: Date.now(), args: [type] });
    return this._supportedArtifacts.includes(type);
  }

  async validate(): Promise<Result<void>> {
    this.calls.push({ method: 'validate', timestamp: Date.now() });
    if (this._shouldFailValidate) {
      return err('Mock sink validation failure');
    }
    return ok(undefined);
  }

  async write(artifact: unknown, type: ArtifactType): Promise<Result<string>> {
    this.calls.push({ method: 'write', timestamp: Date.now(), args: [artifact, type] });

    if (this._writeDelay > 0) {
      await new Promise(r => setTimeout(r, this._writeDelay));
    }

    if (this._shouldFailWrite) {
      return err('Mock write failure');
    }

    if (this._failOnArtifactType && type === this._failOnArtifactType) {
      return err(`Mock write failure for artifact type: ${type}`);
    }

    const path = `/mock/${type}/${Date.now()}.json`;
    this.written.push({ artifact, type, timestamp: Date.now(), path });
    return ok(path);
  }

  async close(): Promise<void> {
    this.calls.push({ method: 'close', timestamp: Date.now() });
    this._closed = true;
  }

  get isClosed(): boolean { return this._closed; }
  get writeCount(): number { return this.written.length; }

  getWrittenByType(type: ArtifactType): WrittenArtifact[] {
    return this.written.filter(w => w.type === type);
  }

  assertWritten(type: ArtifactType, count?: number): void {
    const matching = this.getWrittenByType(type);
    if (count !== undefined && matching.length !== count) {
      throw new Error(`Expected ${count} ${type} writes, got ${matching.length}`);
    }
    if (matching.length === 0) {
      throw new Error(`Expected at least one ${type} write, got none`);
    }
  }

  reset(): void {
    this.calls.length = 0;
    this.written.length = 0;
    this._closed = false;
  }
}

export function createMockSink(options?: MockSinkOptions): MockSinkAdapter {
  return new MockSinkAdapter(options);
}
