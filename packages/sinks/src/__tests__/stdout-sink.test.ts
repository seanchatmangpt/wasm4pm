/**
 * StdoutSinkAdapter Tests
 * Tests for writing artifacts to writable streams
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'stream';
import { StdoutSinkAdapter } from '../stdout-sink.js';
import { isOk } from '@wasm4pm/contracts';

/**
 * Helper: create a writable stream that buffers output
 */
function createBufferStream(): { stream: Writable; getOutput: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    getOutput: () => chunks.join(''),
  };
}

describe('StdoutSinkAdapter', () => {
  describe('initialization', () => {
    it('should create adapter with default config', () => {
      const { stream } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream });
      expect(adapter.kind).toBe('custom');
      expect(adapter.version).toBe('1.0.0');
    });

    it('should have correct properties', () => {
      const { stream } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream });
      expect(adapter.atomicity).toBe('none');
      expect(adapter.onExists).toBe('append');
      expect(adapter.failureMode).toBe('fail');
    });

    it('should support all artifact types', () => {
      const { stream } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream });
      const supported = adapter.supportedArtifacts();

      expect(supported).toContain('receipt');
      expect(supported).toContain('model');
      expect(supported).toContain('report');
      expect(supported).toContain('explain_snapshot');
      expect(supported).toContain('status_snapshot');
    });
  });

  describe('validate()', () => {
    it('should validate writable stream', async () => {
      const { stream } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should fail on destroyed stream', async () => {
      const { stream } = createBufferStream();
      stream.destroy();
      const adapter = new StdoutSinkAdapter({ stream });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(false);
    });
  });

  describe('write() - Receipts', () => {
    it('should write receipt as pretty JSON', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream, pretty: true });

      const receipt = {
        run_id: 'run-001',
        algorithm: 'dfg',
        status: 'success',
      };

      const result = await adapter.write(receipt, 'receipt');
      expect(isOk(result)).toBe(true);

      const output = getOutput();
      expect(output).toContain('"run_id"');
      expect(output).toContain('run-001');
      expect(output).toContain('\n'); // Pretty-printed
    });

    it('should write receipt as compact JSON', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream, pretty: false });

      const receipt = { run_id: 'run-001', algorithm: 'dfg' };
      await adapter.write(receipt, 'receipt');

      const output = getOutput();
      expect(output).toBe('{"run_id":"run-001","algorithm":"dfg"}');
    });
  });

  describe('write() - Reports', () => {
    it('should write HTML report as raw content', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream });

      const report = {
        name: 'test',
        format: 'html',
        content: '<html><body>Report</body></html>',
      };

      const result = await adapter.write(report, 'report');
      expect(isOk(result)).toBe(true);

      const output = getOutput();
      expect(output).toBe('<html><body>Report</body></html>');
    });

    it('should write Markdown report as raw content', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream });

      const report = {
        name: 'test',
        format: 'markdown',
        content: '# Process Report\n\nContent here',
      };

      await adapter.write(report, 'report');
      expect(getOutput()).toBe('# Process Report\n\nContent here');
    });

    it('should write JSON report as JSON', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream, pretty: false });

      const report = {
        name: 'test',
        format: 'json',
        content: '{"data": 1}',
      };

      await adapter.write(report, 'report');
      const output = getOutput();
      // JSON format reports are serialized as JSON objects
      expect(output).toContain('"name":"test"');
    });
  });

  describe('write() - Multiple artifacts', () => {
    it('should separate artifacts with newline', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream, pretty: false });

      await adapter.write({ id: 1 }, 'receipt');
      await adapter.write({ id: 2 }, 'receipt');

      const output = getOutput();
      expect(output).toBe('{"id":1}\n{"id":2}');
    });

    it('should use custom separator', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream, pretty: false, separator: '\n---\n' });

      await adapter.write({ id: 1 }, 'receipt');
      await adapter.write({ id: 2 }, 'receipt');

      const output = getOutput();
      expect(output).toBe('{"id":1}\n---\n{"id":2}');
    });

    it('should return unique artifact IDs', async () => {
      const { stream } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream });

      const r1 = await adapter.write({}, 'receipt');
      const r2 = await adapter.write({}, 'model');

      expect(isOk(r1)).toBe(true);
      expect(isOk(r2)).toBe(true);

      if (isOk(r1) && isOk(r2)) {
        expect(r1.value).not.toBe(r2.value);
        expect(r1.value).toContain('stdout-receipt');
        expect(r2.value).toContain('stdout-model');
      }
    });
  });

  describe('write() - Models', () => {
    it('should write model as JSON', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream, pretty: false });

      const model = { name: 'model', nodes: [], edges: [] };
      const result = await adapter.write(model, 'model');
      expect(isOk(result)).toBe(true);

      const output = getOutput();
      expect(output).toContain('"name":"model"');
    });
  });

  describe('write() - Snapshots', () => {
    it('should write explain snapshot', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream, pretty: false });

      const snapshot = { timestamp: '2024-01-01T00:00:00Z', explanation: 'planning step 1' };
      const result = await adapter.write(snapshot, 'explain_snapshot');
      expect(isOk(result)).toBe(true);

      expect(getOutput()).toContain('planning step 1');
    });

    it('should write status snapshot', async () => {
      const { stream, getOutput } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream, pretty: false });

      const snapshot = { timestamp: '2024-01-01T00:00:00Z', state: 'running' };
      const result = await adapter.write(snapshot, 'status_snapshot');
      expect(isOk(result)).toBe(true);

      expect(getOutput()).toContain('running');
    });
  });

  describe('close()', () => {
    it('should close custom stream', async () => {
      const { stream } = createBufferStream();
      const adapter = new StdoutSinkAdapter({ stream });

      await adapter.close();
      expect(stream.destroyed || stream.writableEnded).toBe(true);
    });

    it('should not close process.stdout', async () => {
      // Use process.stdout explicitly
      const adapter = new StdoutSinkAdapter({ stream: process.stdout });
      await adapter.close();
      // process.stdout should still be open
      expect(process.stdout.destroyed).toBe(false);
    });
  });
});
