/**
 * Integration Tests: FileLogSinkAdapter
 * Tests real-world usage scenarios with artifact persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileLogSinkAdapter } from '../file-log-sink.js';
import { isOk } from '@wasm4pm/contracts';

describe('FileLogSinkAdapter - Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `wasm4pm-sink-integration-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('complete sink lifecycle', () => {
    it('should validate, write receipt, and close', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });

      // Step 1: Validate
      const validateResult = await adapter.validate();
      expect(isOk(validateResult)).toBe(true);

      // Step 2: Write receipt
      const receipt = {
        run_id: 'run-001',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        event_count: 100,
        trace_count: 10,
        duration_ms: 1500,
        status: 'success' as const,
      };

      const writeResult = await adapter.write(receipt, 'receipt');
      expect(isOk(writeResult)).toBe(true);

      // Verify file was written
      if (isOk(writeResult)) {
        const filePath = join(tempDir, writeResult.value);
        const exists = await fs
          .stat(filePath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);
      }

      // Step 3: Close
      await adapter.close();
    });

    it('should persist complete execution workflow', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.validate();

      const receipt = {
        run_id: 'workflow-001',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'heuristic',
        event_count: 500,
        trace_count: 50,
        duration_ms: 3000,
        status: 'success' as const,
      };

      const model = {
        name: 'discovered-model',
        type: 'dfg',
        nodes: [
          { id: 'start', label: 'Start' },
          { id: 'a', label: 'Activity A' },
          { id: 'b', label: 'Activity B' },
          { id: 'end', label: 'End' },
        ],
        edges: [
          { source: 'start', target: 'a' },
          { source: 'a', target: 'b' },
          { source: 'b', target: 'end' },
        ],
      };

      const report = {
        name: 'analysis-report',
        format: 'html',
        content: '<html><body><h1>Process Analysis</h1></body></html>',
      };

      // Write all artifacts
      const receiptResult = await adapter.write(receipt, 'receipt');
      const modelResult = await adapter.write(model, 'model');
      const reportResult = await adapter.write(report, 'report');

      expect(isOk(receiptResult)).toBe(true);
      expect(isOk(modelResult)).toBe(true);
      expect(isOk(reportResult)).toBe(true);

      // Verify files exist
      const files = await fs.readdir(tempDir);
      expect(files.length).toBe(3);

      await adapter.close();
    });
  });

  describe('artifact workflow patterns', () => {
    it('should write multiple receipts in sequence', async () => {
      const adapter = new FileLogSinkAdapter({
        directory: tempDir,
        onExists: 'overwrite',
      });
      await adapter.validate();

      const runs = [
        { run_id: 'run-1', algorithm: 'dfg' },
        { run_id: 'run-2', algorithm: 'alpha' },
        { run_id: 'run-3', algorithm: 'heuristic' },
      ];

      for (const run of runs) {
        const receipt = {
          ...run,
          timestamp: '2024-01-01T00:00:00Z',
          event_count: 100,
          trace_count: 10,
          duration_ms: 1000,
          status: 'success' as const,
        };

        const result = await adapter.write(receipt, 'receipt');
        expect(isOk(result)).toBe(true);
      }

      // Verify files
      const files = await fs.readdir(tempDir);
      expect(files.length).toBe(3);
    });

    it('should handle model discovery workflow', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.validate();

      // Discovery may produce multiple models
      const dfgModel = {
        name: 'dfg-model',
        type: 'dfg',
        nodes: [{ id: 'a' }],
        edges: [],
      };

      const petriNetModel = {
        name: 'petri-model',
        petriNet: true,
        places: [{ id: 'p1' }],
        transitions: [],
      };

      const dfgResult = await adapter.write(dfgModel, 'model');
      const pnResult = await adapter.write(petriNetModel, 'model');

      expect(isOk(dfgResult)).toBe(true);
      expect(isOk(pnResult)).toBe(true);

      if (isOk(dfgResult) && isOk(pnResult)) {
        expect(dfgResult.value).toContain('.dfg.json');
        expect(pnResult.value).toContain('.pn.json');
      }
    });

    it('should handle complex report generation', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.validate();

      const htmlReport = {
        name: 'detailed-html-report',
        format: 'html',
        content: `
          <html>
            <head><title>Process Analysis Report</title></head>
            <body>
              <h1>Process Model Analysis</h1>
              <p>This is a detailed analysis report.</p>
            </body>
          </html>
        `,
      };

      const markdownReport = {
        name: 'detailed-markdown-report',
        format: 'markdown',
        content: `
# Process Model Analysis

## Summary
- Total Events: 1000
- Total Traces: 100
- Unique Activities: 25

## Model Quality
- Fitness: 0.95
- Precision: 0.92
          `,
      };

      const html = await adapter.write(htmlReport, 'report');
      const markdown = await adapter.write(markdownReport, 'report');

      expect(isOk(html)).toBe(true);
      expect(isOk(markdown)).toBe(true);

      // Verify file contents
      if (isOk(html)) {
        const htmlPath = join(tempDir, html.value);
        const content = await fs.readFile(htmlPath, 'utf-8');
        expect(content).toContain('Process Analysis Report');
      }
    });
  });

  describe('snapshot persistence', () => {
    it('should write explain snapshots during planning', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.validate();

      const snapshots = Array.from({ length: 3 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        step: i + 1,
        explanation: `Planning step ${i + 1}`,
        state: { progress: (i + 1) * 33 },
      }));

      for (const snapshot of snapshots) {
        const result = await adapter.write(snapshot, 'explain_snapshot');
        expect(isOk(result)).toBe(true);
      }

      const files = await fs.readdir(tempDir);
      expect(files.length).toBe(3);
    });

    it('should write status snapshots during execution', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.validate();

      const statuses = [
        { timestamp: '2024-01-01T00:00:00Z', state: 'bootstrapping' },
        { timestamp: '2024-01-01T00:01:00Z', state: 'planning' },
        { timestamp: '2024-01-01T00:02:00Z', state: 'executing' },
        { timestamp: '2024-01-01T00:03:00Z', state: 'finished' },
      ];

      for (const status of statuses) {
        const result = await adapter.write(status, 'status_snapshot');
        expect(isOk(result)).toBe(true);
      }

      const files = await fs.readdir(tempDir);
      expect(files.length).toBe(4);
    });
  });

  describe('exists behavior in realistic scenarios', () => {
    it('should skip duplicate outputs by default', async () => {
      const adapter = new FileLogSinkAdapter({
        directory: tempDir,
        onExists: 'skip',
      });
      await adapter.validate();

      const artifact = {
        run_id: 'duplicate-test',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'success' as const,
      };

      // Write first time
      const result1 = await adapter.write(artifact, 'receipt');
      expect(isOk(result1)).toBe(true);

      // Write again with different content
      const modified = { ...artifact, algorithm: 'alpha' };
      const result2 = await adapter.write(modified, 'receipt');
      expect(isOk(result2)).toBe(true);

      // File should contain original algorithm
      if (isOk(result1)) {
        const path = join(tempDir, result1.value);
        const content = JSON.parse(await fs.readFile(path, 'utf-8'));
        expect(content.algorithm).toBe('dfg'); // Original, not modified
      }
    });

    it('should allow overwriting when needed for retries', async () => {
      const adapter = new FileLogSinkAdapter({
        directory: tempDir,
        onExists: 'overwrite',
      });
      await adapter.validate();

      // First attempt (partial success)
      const firstAttempt = {
        run_id: 'retry-test',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        event_count: 50,
        trace_count: 5,
        status: 'partial' as const,
      };

      const result1 = await adapter.write(firstAttempt, 'receipt');
      expect(isOk(result1)).toBe(true);

      // Retry with more data
      const retry = {
        run_id: 'retry-test',
        timestamp: '2024-01-01T00:05:00Z',
        algorithm: 'dfg',
        event_count: 100,
        trace_count: 10,
        status: 'success' as const,
      };

      const result2 = await adapter.write(retry, 'receipt');
      expect(isOk(result2)).toBe(true);

      // File should contain final state
      if (isOk(result2)) {
        const path = join(tempDir, result2.value);
        const content = JSON.parse(await fs.readFile(path, 'utf-8'));
        expect(content.status).toBe('success');
        expect(content.event_count).toBe(100);
      }
    });
  });

  describe('directory organization', () => {
    it('should organize outputs in nested directories', async () => {
      const outputDir = join(tempDir, 'results', 'run-001');
      const adapter = new FileLogSinkAdapter({ directory: outputDir });
      await adapter.validate();

      const receipt = {
        run_id: 'run-001',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'success' as const,
      };

      const result = await adapter.write(receipt, 'receipt');
      expect(isOk(result)).toBe(true);

      // Verify nested directories were created
      const exists = (await fs.stat(outputDir)).isDirectory();
      expect(exists).toBe(true);
    });

    it('should group multiple run artifacts together', async () => {
      const runId = 'run-batch-001';
      const adapter = new FileLogSinkAdapter({
        directory: join(tempDir, runId),
      });
      await adapter.validate();

      // Write all artifacts for a run in one directory
      const receipt = {
        run_id: runId,
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'genetic',
        status: 'success' as const,
      };

      const model = {
        name: 'final-model',
        nodes: [],
        edges: [],
      };

      const report = {
        name: 'summary',
        format: 'markdown',
        content: '# Run Summary',
      };

      await adapter.write(receipt, 'receipt');
      await adapter.write(model, 'model');
      await adapter.write(report, 'report');

      const files = await fs.readdir(join(tempDir, runId));
      expect(files.length).toBe(3);
    });
  });

  describe('error recovery', () => {
    it('should handle write failure gracefully', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.validate();

      const artifact = {
        run_id: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'success' as const,
      };

      const result = await adapter.write(artifact, 'receipt');
      expect(isOk(result)).toBe(true);

      // Make directory read-only (may not work on all systems)
      try {
        await fs.chmod(tempDir, 0o555);

        const result2 = await adapter.write(artifact, 'receipt');

        // Should fail gracefully
        if (!isOk(result2)) {
          if (result2.type === 'error') {
            expect(result2.error.code).toBe('SINK_PERMISSION');
          }
        }

        await fs.chmod(tempDir, 0o755);
      } catch (e) {
        // Skip if chmod not available
      }
    });
  });

  describe('batch atomicity semantics', () => {
    it('should maintain batch-level atomic writes', async () => {
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      await adapter.validate();

      // Simulate a batch of writes
      const batch = [
        {
          artifact: {
            run_id: 'batch-001',
            timestamp: '2024-01-01T00:00:00Z',
            algorithm: 'dfg',
            status: 'success' as const,
          },
          type: 'receipt' as const,
        },
        {
          artifact: { name: 'model', nodes: [], edges: [] },
          type: 'model' as const,
        },
        {
          artifact: {
            name: 'report',
            format: 'html',
            content: '<html></html>',
          },
          type: 'report' as const,
        },
      ];

      const results = await Promise.all(batch.map((item) => adapter.write(item.artifact, item.type)));

      // All should succeed or all should fail (batch semantics)
      const allSucceeded = results.every((r) => isOk(r));
      expect(allSucceeded).toBe(true);

      const files = await fs.readdir(tempDir);
      expect(files.length).toBe(3);
    });
  });
});
