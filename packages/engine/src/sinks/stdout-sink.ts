/**
 * StdoutSinkAdapter - Write artifacts to stdout / a writable stream
 *
 * Useful for piping output to other tools or viewing results in the terminal.
 * Outputs JSON for structured artifacts, raw text for reports.
 */

import type { Writable } from 'stream';
import {
  SinkAdapter,
  ArtifactType,
  SinkAdapterKind,
  Result,
  ExistsBehavior,
  AtomicityLevel,
  FailureMode,
} from '@wasm4pm/contracts';
import { ok, err } from '@wasm4pm/contracts';

/**
 * Configuration for StdoutSinkAdapter
 */
export interface StdoutSinkConfig {
  /** Output stream. Defaults to process.stdout. */
  stream?: Writable;
  /** Whether to pretty-print JSON (default: true) */
  pretty?: boolean;
  /** Separator between artifacts (default: newline) */
  separator?: string;
}

/**
 * StdoutSinkAdapter - Writes artifacts to stdout or a writable stream
 *
 * Supports all artifact types. Formats:
 * - Receipts, models, snapshots: JSON
 * - Reports (HTML/Markdown): raw content
 *
 * Atomicity: none (streams are append-only, no rollback)
 */
export class StdoutSinkAdapter implements SinkAdapter {
  readonly kind: SinkAdapterKind = 'custom';
  readonly version = '1.0.0';
  readonly atomicity: AtomicityLevel = 'none';
  readonly onExists: ExistsBehavior = 'append';
  readonly failureMode: FailureMode = 'fail';

  private config: Required<StdoutSinkConfig>;
  private artifactCount = 0;

  constructor(config: StdoutSinkConfig = {}) {
    this.config = {
      stream: config.stream ?? process.stdout,
      pretty: config.pretty ?? true,
      separator: config.separator ?? '\n',
    };
  }

  supportedArtifacts(): ArtifactType[] {
    return ['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot'];
  }

  supportsArtifact(type: ArtifactType): boolean {
    return this.supportedArtifacts().includes(type);
  }

  async validate(): Promise<Result<void>> {
    if (!this.config.stream || typeof this.config.stream.write !== 'function') {
      return err('No writable stream available');
    }

    if (this.config.stream.destroyed) {
      return err('Output stream is already destroyed');
    }

    return ok(undefined);
  }

  async write(artifact: unknown, type: ArtifactType): Promise<Result<string>> {
    if (!this.supportsArtifact(type)) {
      return err(`Unsupported artifact type: ${type}`);
    }

    try {
      const output = this.formatArtifact(artifact, type);
      const prefix = this.artifactCount > 0 ? this.config.separator : '';

      await this.writeToStream(`${prefix}${output}`);
      this.artifactCount++;

      const id = `stdout-${type}-${this.artifactCount}`;
      return ok(id);
    } catch (e) {
      return err(`Failed to write to stdout: ${(e as Error).message}`);
    }
  }

  async close(): Promise<void> {
    // Don't close stdout/stderr — only close custom streams
    if (
      this.config.stream !== process.stdout &&
      this.config.stream !== process.stderr
    ) {
      this.config.stream.end();
    }
  }

  private formatArtifact(artifact: unknown, type: ArtifactType): string {
    const data = artifact as Record<string, unknown>;

    // Reports with raw content
    if (type === 'report') {
      if (data.format === 'html' || data.format === 'markdown') {
        return (data.content as string) ?? '';
      }
    }

    // Everything else: JSON
    if (this.config.pretty) {
      return JSON.stringify(artifact, null, 2);
    }
    return JSON.stringify(artifact);
  }

  private writeToStream(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const canContinue = this.config.stream.write(data, 'utf-8');
      if (canContinue) {
        resolve();
      } else {
        this.config.stream.once('drain', resolve);
        this.config.stream.once('error', reject);
      }
    });
  }
}
