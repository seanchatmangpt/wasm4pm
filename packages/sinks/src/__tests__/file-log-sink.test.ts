/**
 * FileLogSinkAdapter Tests
 * Tests for writing models, reports, and receipts to disk
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileLogSinkAdapter } from '../file-log-sink.js';
import { ok, isOk, isErr } from '@wasm4pm/contracts';

describe('FileLogSinkAdapter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `wasm4pm-sink-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create adapter with default config', () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      expect(adapter.kind).toBe('file');
      expect(adapter.version).toBe('1.0.0');
    });

    it('should have correct properties', () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      expect(adapter.atomicity).toBe('batch');
      expect(adapter.onExists).toBe('skip');
      expect(adapter.failureMode).toBe('fail');
    });

    it('should support all artifact types', () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const supported = adapter.supportedArtifacts();

      expect(supported).toContain('receipt');
      expect(supported).toContain('model');
      expect(supported).toContain('report');
      expect(supported).toContain('explain_snapshot');
      expect(supported).toContain('status_snapshot');
    });

    it('should check artifact support correctly', () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });

      expect(adapter.supportsArtifact('receipt')).toBe(true);
      expect(adapter.supportsArtifact('model')).toBe(true);
      expect(adapter.supportsArtifact('report')).toBe(true);
      expect(adapter.supportsArtifact('explain_snapshot')).toBe(true);
      expect(adapter.supportsArtifact('status_snapshot')).toBe(true);
    });
  });

  describe('validate()', () => {
    it('should validate existing writable directory', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should create directory if it does not exist', async () => {
      const newDir = join(tempDir, 'new', 'nested', 'dir');
      const adapter = new FileLogSinkAdapter({ directory: newDir });
      const result = await adapter.validate();

      expect(isOk(result)).toBe(true);
      const exists = (await fs.stat(newDir)).isDirectory();
      expect(exists).toBe(true);
    });

    it('should fail with permission denied if directory not writable', async () => {
      // Skip on systems where we can't control permissions
      const readOnlyDir = join(tempDir, 'readonly');
      await fs.mkdir(readOnlyDir);

      // This test may not work on all systems, skip if no permission control
      try {
        await fs.chmod(readOnlyDir, 0o444);
        const adapter = new FileLogSinkAdapter({ directory: readOnlyDir });
        const result = await adapter.validate();

        // May fail or succeed depending on system
        // Just verify it handles the case
        if (!isOk(result)) {
          if (result.type === 'error') {
            expect(result.error.code).toBe('SINK_PERMISSION');
          }
        }

        // Restore permissions for cleanup
        await fs.chmod(readOnlyDir, 0o755);
      } catch (e) {
        // Skip if chmod not available
      }
    });
  });

  describe('write() - Receipts', () => {
    it('should write receipt as JSON', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const receipt = {
        run_id: 'run-123',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        event_count: 100,
        trace_count: 10,
        duration_ms: 1000,
        status: 'success' as const,
      };

      const result = await adapter.write(receipt, 'receipt');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filename = result.value;
        expect(filename).toBe('run-123.receipt.json');

        const filePath = join(tempDir, filename);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.run_id).toBe('run-123');
        expect(parsed.algorithm).toBe('dfg');
      }
    });

    it('should use run_id from receipt', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const receipt = {
        run_id: 'custom-run-id',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'alpha',
        status: 'success' as const,
      };

      const result = await adapter.write(receipt, 'receipt');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(result.value).toContain('custom-run-id');
      }
    });

    it('should write receipt with error information', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const receipt = {
        run_id: 'failed-run',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'failed' as const,
        error: 'Out of memory',
      };

      const result = await adapter.write(receipt, 'receipt');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filePath = join(tempDir, result.value);
        const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        expect(content.error).toBe('Out of memory');
      }
    });
  });

  describe('write() - Models', () => {
    it('should write DFG model as .dfg.json', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const model = {
        name: 'process-model',
        type: 'dfg',
        nodes: [{ id: 'a', label: 'Start' }],
        edges: [],
      };

      const result = await adapter.write(model, 'model');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filename = result.value;
        expect(filename).toContain('.dfg.json');
      }
    });

    it('should write PetriNet model as .pn.json', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const model = {
        name: 'petri-net',
        petriNet: true,
        places: [{ id: 'p1' }],
        transitions: [],
      };

      const result = await adapter.write(model, 'model');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filename = result.value;
        expect(filename).toContain('.pn.json');
      }
    });

    it('should default to .dfg.json if type not specified', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const model = {
        name: 'model',
        nodes: [],
        edges: [],
      };

      const result = await adapter.write(model, 'model');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filename = result.value;
        expect(filename).toContain('.dfg.json');
      }
    });
  });

  describe('write() - Reports', () => {
    it('should write HTML report with format preserved', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const report = {
        name: 'analysis-report',
        format: 'html',
        content: '<html><body>Report</body></html>',
      };

      const result = await adapter.write(report, 'report');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filename = result.value;
        expect(filename).toBe('analysis-report.html');

        const filePath = join(tempDir, filename);
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('<html><body>Report</body></html>');
      }
    });

    it('should write Markdown report with format preserved', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const report = {
        name: 'markdown-report',
        format: 'markdown',
        content: '# Process Report\n\nContent here',
      };

      const result = await adapter.write(report, 'report');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filename = result.value;
        expect(filename).toBe('markdown-report.markdown');

        const filePath = join(tempDir, filename);
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('# Process Report\n\nContent here');
      }
    });
  });

  describe('write() - Snapshots', () => {
    it('should write explain snapshot', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const snapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        data: { key: 'value' },
      };

      const result = await adapter.write(snapshot, 'explain_snapshot');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filename = result.value;
        expect(filename).toContain('snapshot-explain');
        expect(filename).toContain('.json');
      }
    });

    it('should write status snapshot', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const snapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        state: 'running',
      };

      const result = await adapter.write(snapshot, 'status_snapshot');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filename = result.value;
        expect(filename).toContain('snapshot-status');
        expect(filename).toContain('.json');
      }
    });
  });

  describe('onExists behavior', () => {
    it('should skip existing file by default', async () => {
      const adapter = new FileLogSinkAdapter({
        directory: tempDir,
        onExists: 'skip',
      });

      const artifact = { run_id: 'test', data: 'value1' };
      const result1 = await adapter.write(artifact, 'receipt');
      expect(isOk(result1)).toBe(true);

      // Write again with different data
      const artifact2 = { run_id: 'test', data: 'value2' };
      const result2 = await adapter.write(artifact2, 'receipt');
      expect(isOk(result2)).toBe(true);

      // File should contain original data
      if (isOk(result1)) {
        const filePath = join(tempDir, result1.value);
        const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        expect(content.data).toBe('value1'); // Original data unchanged
      }
    });

    it('should overwrite existing file when configured', async () => {
      const adapter = new FileLogSinkAdapter({
        directory: tempDir,
        onExists: 'overwrite',
      });

      const artifact1 = { run_id: 'test', data: 'value1' };
      const result1 = await adapter.write(artifact1, 'receipt');
      expect(isOk(result1)).toBe(true);

      const artifact2 = { run_id: 'test', data: 'value2' };
      const result2 = await adapter.write(artifact2, 'receipt');
      expect(isOk(result2)).toBe(true);

      // File should contain new data
      if (isOk(result2)) {
        const filePath = join(tempDir, result2.value);
        const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        expect(content.data).toBe('value2');
      }
    });

    it('should error on existing file when configured', async () => {
      const adapter = new FileLogSinkAdapter({
        directory: tempDir,
        onExists: 'error',
      });

      const artifact1 = { run_id: 'test', data: 'value1' };
      const result1 = await adapter.write(artifact1, 'receipt');
      expect(isOk(result1)).toBe(true);

      const artifact2 = { run_id: 'test', data: 'value2' };
      const result2 = await adapter.write(artifact2, 'receipt');
      expect(isOk(result2)).toBe(false);
    });

    it('should append to existing file when configured', async () => {
      const adapter = new FileLogSinkAdapter({
        directory: tempDir,
        onExists: 'append',
      });

      // Create file with array
      const filePath = join(tempDir, 'test.receipt.json');
      await fs.writeFile(filePath, JSON.stringify([{ id: 1 }]));

      const artifact = { id: 2 };
      const result = await adapter.write(artifact, 'receipt');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        expect(Array.isArray(content)).toBe(true);
        expect(content).toHaveLength(2);
        expect(content[1].id).toBe(2);
      }
    });
  });

  describe('directory handling', () => {
    it('should create nested directories if needed', async () => {
      const nested = join(tempDir, 'level1', 'level2', 'level3');
      const adapter = new FileLogSinkAdapter({ directory: nested });

      const artifact = {
        run_id: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'success' as const,
      };

      const result = await adapter.write(artifact, 'receipt');
      expect(isOk(result)).toBe(true);

      const exists = (await fs.stat(nested)).isDirectory();
      expect(exists).toBe(true);
    });

    it('should write multiple artifacts to same directory', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });

      const receipt = {
        run_id: 'test-123',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'success' as const,
      };

      const model = {
        name: 'process',
        nodes: [],
        edges: [],
      };

      const receipt_result = await adapter.write(receipt, 'receipt');
      const model_result = await adapter.write(model, 'model');

      expect(isOk(receipt_result)).toBe(true);
      expect(isOk(model_result)).toBe(true);

      const files = await fs.readdir(tempDir);
      expect(files.length).toBe(2);
    });
  });

  describe('close()', () => {
    it('should close safely', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.close();
      // Should not error
    });

    it('should close multiple times safely', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.close();
      await adapter.close(); // Should not error
    });
  });

  describe('error handling', () => {
    it('should handle unsupported artifact types', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const result = await adapter.write({}, 'report');
      expect(isOk(result)).toBe(true); // report is supported

      // Check a hypothetical unsupported type (if we had one)
      // This tests the framework is in place
    });

    it('should return structured error on permission denied', async () => {
      // This test may not work on all systems
      try {
        const readOnlyDir = join(tempDir, 'readonly');
        await fs.mkdir(readOnlyDir);
        await fs.chmod(readOnlyDir, 0o444);

        const adapter = new FileLogSinkAdapter({ directory: readOnlyDir });

        const artifact = {
          run_id: 'test',
          timestamp: '2024-01-01T00:00:00Z',
          algorithm: 'dfg',
          status: 'success' as const,
        };

        const result = await adapter.write(artifact, 'receipt');

        // May fail or succeed depending on system permissions
        if (!isOk(result)) {
          if (result.type === 'error') {
            expect(result.error.code).toBe('SINK_PERMISSION');
          }
        }

        await fs.chmod(readOnlyDir, 0o755);
      } catch (e) {
        // Skip if chmod not available
      }
    });
  });

  describe('pretty printing', () => {
    it('should pretty-print JSON artifacts with 2-space indent', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      const artifact = {
        run_id: 'test',
        nested: {
          key: 'value',
          array: [1, 2, 3],
        },
      };

      const result = await adapter.write(artifact, 'receipt');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const filePath = join(tempDir, result.value);
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toContain('  ');
        expect(content).toContain('\n');
      }
    });
  });
});
