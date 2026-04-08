/**
 * FileLogSinkAdapter - Write models/reports/receipts to disk
 *
 * Handles:
 * - Receipt: JSON with run metadata
 * - Model: DFG as .dfg.json, PetriNet as .pn.json
 * - Report: HTML/Markdown process reports
 * - Status Snapshots: Point-in-time execution state
 *
 * Atomicity: batch-level (all artifacts in a run written together)
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import {
  SinkAdapter,
  ArtifactType,
  SinkAdapterKind,
  Result,
  ExistsBehavior,
  AtomicityLevel,
  FailureMode,
} from '@pictl/contracts';
import { ok, err, error } from '@pictl/contracts';
import { createError } from '@pictl/contracts';

/**
 * Configuration for FileLogSinkAdapter
 */
export interface FileLogSinkConfig {
  directory: string;
  onExists?: ExistsBehavior;
  failureMode?: FailureMode;
}

/**
 * Receipt artifact structure
 */
export interface Receipt {
  run_id: string;
  timestamp: string;
  algorithm: string;
  input_file?: string;
  status: 'success' | 'failed' | 'partial';
  event_count?: number;
  trace_count?: number;
  duration_ms?: number;
  error?: string;
}

/**
 * FileLogSinkAdapter - Write results to local filesystem
 *
 * Supports writing:
 * - Receipts: JSON metadata about run
 * - Models: DFG and PetriNet in JSON format
 * - Reports: HTML and Markdown reports
 * - Snapshots: Execution state snapshots
 *
 * Features:
 * - Atomic batch writes
 * - Configurable exists behavior (skip/overwrite/error)
 * - Automatic directory creation
 */
export class FileLogSinkAdapter implements SinkAdapter {
  readonly kind: SinkAdapterKind = 'file';
  readonly version = '1.0.0';
  readonly atomicity: AtomicityLevel = 'batch';
  readonly onExists: ExistsBehavior = 'skip';
  readonly failureMode: FailureMode = 'fail';

  private config: Required<FileLogSinkConfig>;

  constructor(config: FileLogSinkConfig) {
    this.config = {
      onExists: 'skip',
      failureMode: 'fail',
      ...config,
    };
  }

  /**
   * List supported artifact types
   */
  supportedArtifacts(): ArtifactType[] {
    return ['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot'];
  }

  /**
   * Check if sink supports specific artifact type
   */
  supportsArtifact(type: ArtifactType): boolean {
    return this.supportedArtifacts().includes(type);
  }

  /**
   * Validate sink configuration and destination
   */
  async validate(): Promise<Result<void>> {
    try {
      // Try to create directory if it doesn't exist
      await fs.mkdir(this.config.directory, { recursive: true });

      // Check if we can write
      const testFile = `${this.config.directory}/.wasm4pm-write-test-${Date.now()}`;
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      return ok(undefined);
    } catch (e) {
      if ((e as any).code === 'EACCES') {
        return error(
          createError(
            'SINK_PERMISSION',
            `Permission denied writing to: ${this.config.directory}`,
            { directory: this.config.directory }
          )
        );
      }

      return err(`Validation failed: ${e}`);
    }
  }

  /**
   * Write artifact to sink
   * Returns artifact ID (filename without extension)
   */
  async write(artifact: unknown, type: ArtifactType): Promise<Result<string>> {
    try {
      if (!this.supportsArtifact(type)) {
        return err(`Unsupported artifact type: ${type}`);
      }

      const filename = this.getFilename(artifact, type);
      const filePath = `${this.config.directory}/${filename}`;

      // Check if file exists and handle according to onExists policy
      try {
        await fs.stat(filePath);

        // File exists
        switch (this.config.onExists) {
          case 'skip':
            return ok(filename);
          case 'error':
            return err(`File already exists: ${filePath}`);
          case 'append':
            // For append: read existing, merge, write back
            return this.appendArtifact(filePath, artifact, type);
          case 'overwrite':
            // Proceed with overwrite
            break;
        }
      } catch (e) {
        // File doesn't exist, proceed normally
        if ((e as any).code !== 'ENOENT') {
          throw e;
        }
      }

      // Create directory if needed
      await fs.mkdir(dirname(filePath), { recursive: true });

      // Write artifact
      const content = this.formatArtifact(artifact, type);
      await fs.writeFile(filePath, content, 'utf-8');

      return ok(filename);
    } catch (e) {
      if ((e as any).code === 'EACCES') {
        return error(
          createError(
            'SINK_PERMISSION',
            `Permission denied writing artifact: ${e}`,
            { type, artifact: String(artifact) }
          )
        );
      }

      return err(`Failed to write artifact: ${e}`);
    }
  }

  /**
   * Close sink and release resources
   */
  async close(): Promise<void> {
    // No resources to release for file sink
  }

  /**
   * Get filename for artifact
   */
  private getFilename(artifact: unknown, type: ArtifactType): string {
    const now = Date.now();

    switch (type) {
      case 'receipt': {
        const receipt = artifact as any;
        const runId = receipt.run_id || `run-${now}`;
        return `${runId}.receipt.json`;
      }

      case 'model': {
        const model = artifact as any;
        const name = model.name || `model-${now}`;
        // Determine model type from content
        if (model.petriNet) {
          return `${name}.pn.json`;
        }
        return `${name}.dfg.json`;
      }

      case 'report': {
        const report = artifact as any;
        const name = report.name || `report-${now}`;
        const format = report.format || 'html';
        return `${name}.${format}`;
      }

      case 'explain_snapshot':
        return `snapshot-explain-${now}.json`;

      case 'status_snapshot':
        return `snapshot-status-${now}.json`;

      default:
        return `artifact-${now}.json`;
    }
  }

  /**
   * Format artifact for file writing
   */
  private formatArtifact(artifact: unknown, type: ArtifactType): string {
    const data = artifact as any;

    // For HTML reports, return content directly
    if (type === 'report' && data.format === 'html') {
      return data.content || '';
    }

    // For markdown reports, return content directly
    if (type === 'report' && data.format === 'markdown') {
      return data.content || '';
    }

    // For everything else, serialize as JSON with pretty printing
    return JSON.stringify(artifact, null, 2);
  }

  /**
   * Append artifact to existing file (for append mode)
   */
  private async appendArtifact(
    filePath: string,
    artifact: unknown,
    type: ArtifactType
  ): Promise<Result<string>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let existing: any;

      try {
        existing = JSON.parse(content);
      } catch {
        // If existing content is not JSON, treat as text append
        const newContent = `${content}\n${this.formatArtifact(artifact, type)}`;
        await fs.writeFile(filePath, newContent, 'utf-8');
        return ok(filePath);
      }

      // Merge JSON artifacts
      if (Array.isArray(existing)) {
        existing.push(artifact);
      } else if (typeof existing === 'object' && typeof artifact === 'object') {
        existing = { ...existing, ...artifact };
      }

      const newContent = JSON.stringify(existing, null, 2);
      await fs.writeFile(filePath, newContent, 'utf-8');
      return ok(filePath);
    } catch (e) {
      return err(`Failed to append artifact: ${e}`);
    }
  }
}
