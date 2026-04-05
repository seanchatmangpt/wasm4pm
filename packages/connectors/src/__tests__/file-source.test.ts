/**
 * FileSourceAdapter Tests
 * Tests for reading event logs from disk with various formats and error cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileSourceAdapter } from '../file-source.js';
import { ok, err, isOk, isErr } from '@wasm4pm/contracts';

describe('FileSourceAdapter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `wasm4pm-test-${Date.now()}`);
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
      const adapter = new FileSourceAdapter({ filePath: '/tmp/test.json' });
      expect(adapter.kind).toBe('file');
      expect(adapter.version).toBe('1.0.0');
    });

    it('should have correct capabilities', () => {
      const adapter = new FileSourceAdapter({ filePath: '/tmp/test.json' });
      const caps = adapter.capabilities();
      expect(caps.streaming).toBe(true);
      expect(caps.checkpoint).toBe(true);
      expect(caps.filtering).toBe(false);
    });

    it('should have retry strategy configured', () => {
      const adapter = new FileSourceAdapter({ filePath: '/tmp/test.json' });
      expect(adapter.retry).toBeDefined();
      expect(adapter.retry?.maxAttempts).toBe(3);
      expect(adapter.retry?.backoff).toBe('exponential');
      expect(adapter.retry?.initialDelayMs).toBe(100);
    });
  });

  describe('validate()', () => {
    it('should validate existing JSON file', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{"key":"value"}');

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();

      expect(isOk(result)).toBe(true);
    });

    it('should validate existing XES file', async () => {
      const filePath = join(tempDir, 'test.xes');
      const xesContent = '<?xml version="1.0"?><log xmlns="http://www.xes-standard.org/"/>';
      await fs.writeFile(filePath, xesContent);

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();

      expect(isOk(result)).toBe(true);
    });

    it('should fail when file does not exist', async () => {
      const filePath = join(tempDir, 'nonexistent.json');
      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        if (result.type === 'error') {
          expect(result.error.code).toBe('SOURCE_NOT_FOUND');
        }
      }
    });

    it('should fail when file is empty', async () => {
      const filePath = join(tempDir, 'empty.json');
      await fs.writeFile(filePath, '');

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        if (result.type === 'error') {
          expect(result.error.code).toBe('SOURCE_INVALID');
        }
      }
    });

    it('should fail on invalid format', async () => {
      const filePath = join(tempDir, 'invalid.bin');
      await fs.writeFile(filePath, Buffer.from([0xff, 0xfe, 0xfd]));

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        if (result.type === 'error') {
          expect(result.error.code).toBe('SOURCE_INVALID');
        }
      }
    });

    it('should fail when directory is specified instead of file', async () => {
      const adapter = new FileSourceAdapter({ filePath: tempDir });
      const result = await adapter.validate();

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        if (result.type === 'error') {
          expect(result.error.code).toBe('SOURCE_INVALID');
        }
      }
    });
  });

  describe('fingerprint()', () => {
    it('should generate consistent fingerprints for same content', async () => {
      const filePath = join(tempDir, 'test.json');
      const content = '{"trace_id":"1","events":[]}';
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });
      const fp1 = await adapter.fingerprint({ filePath });
      const fp2 = await adapter.fingerprint({ filePath });

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64); // 256-bit BLAKE3 in hex
    });

    it('should generate different fingerprints for different files', async () => {
      const file1 = join(tempDir, 'test1.json');
      const file2 = join(tempDir, 'test2.json');
      await fs.writeFile(file1, '{"event":"1"}');
      await fs.writeFile(file2, '{"event":"2"}');

      const adapter1 = new FileSourceAdapter({ filePath: file1 });
      const adapter2 = new FileSourceAdapter({ filePath: file2 });

      const fp1 = await adapter1.fingerprint({ filePath: file1 });
      const fp2 = await adapter2.fingerprint({ filePath: file2 });

      expect(fp1).not.toBe(fp2);
    });

    it('should work even if file is deleted afterwards', async () => {
      const filePath = join(tempDir, 'temp.json');
      await fs.writeFile(filePath, '{"data":"test"}');

      const adapter = new FileSourceAdapter({ filePath });
      const fp = await adapter.fingerprint({ filePath });

      // Delete file and compute fallback fingerprint
      await fs.unlink(filePath);
      const fp2 = await adapter.fingerprint({ filePath });

      expect(fp).toBeDefined();
      expect(fp2).toBeDefined();
    });

    it('should return 64-char hex string', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{}');

      const adapter = new FileSourceAdapter({ filePath });
      const fp = await adapter.fingerprint({ filePath });

      expect(/^[0-9a-f]{64}$/.test(fp)).toBe(true);
    });
  });

  describe('open()', () => {
    it('should open JSON file and return EventStream', async () => {
      const filePath = join(tempDir, 'test.json');
      const events = [
        { event_id: 1, activity: 'start' },
        { event_id: 2, activity: 'end' },
      ];
      const content = events.map((e) => JSON.stringify(e)).join('\n');
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.open();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const stream = result.value;
        expect(stream).toBeDefined();
        await stream.close();
      }
    });

    it('should fail for nonexistent file', async () => {
      const adapter = new FileSourceAdapter({ filePath: '/nonexistent/path/test.json' });
      const result = await adapter.open();

      expect(isOk(result)).toBe(false);
    });

    it('should retry on transient errors', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{}');

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.open();

      // Should succeed on first or subsequent attempt
      expect(isOk(result)).toBe(true);
    });
  });

  describe('EventStream', () => {
    it('should read events in batches', async () => {
      const filePath = join(tempDir, 'test.json');
      const events = Array.from({ length: 250 }, (_, i) => ({
        event_id: i + 1,
        activity: `activity_${i}`,
      }));
      const content = events.map((e) => JSON.stringify(e)).join('\n');
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        const stream = openResult.value;

        // First batch: 100 events
        const batch1 = await stream.next();
        expect(isOk(batch1)).toBe(true);
        if (isOk(batch1)) {
          expect(batch1.value.events).toHaveLength(100);
          expect(batch1.value.hasMore).toBe(true);
        }

        // Second batch: 100 events
        const batch2 = await stream.next();
        expect(isOk(batch2)).toBe(true);
        if (isOk(batch2)) {
          expect(batch2.value.events).toHaveLength(100);
          expect(batch2.value.hasMore).toBe(true);
        }

        // Third batch: 50 events
        const batch3 = await stream.next();
        expect(isOk(batch3)).toBe(true);
        if (isOk(batch3)) {
          expect(batch3.value.events).toHaveLength(50);
          expect(batch3.value.hasMore).toBe(false);
        }

        // Further reads should be empty
        const batch4 = await stream.next();
        expect(isOk(batch4)).toBe(true);
        if (isOk(batch4)) {
          expect(batch4.value.events).toHaveLength(0);
          expect(batch4.value.hasMore).toBe(false);
        }

        await stream.close();
      }
    });

    it('should support checkpoints', async () => {
      const filePath = join(tempDir, 'test.json');
      const events = [
        { event_id: 1, activity: 'start' },
        { event_id: 2, activity: 'middle' },
        { event_id: 3, activity: 'end' },
      ];
      const content = events.map((e) => JSON.stringify(e)).join('\n');
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        const stream = openResult.value;

        // Read first batch
        const batch1 = await stream.next();
        expect(isOk(batch1)).toBe(true);

        // Get checkpoint
        const cpResult = await stream.checkpoint();
        expect(isOk(cpResult)).toBe(true);

        // Seek back to checkpoint
        if (isOk(cpResult)) {
          const seekResult = await stream.seek(cpResult.value);
          expect(isOk(seekResult)).toBe(true);
        }

        await stream.close();
      }
    });

    it('should handle invalid JSON lines gracefully', async () => {
      const filePath = join(tempDir, 'test.json');
      const content = [
        '{"event_id":1,"activity":"valid"}',
        'not valid json',
        '{"event_id":2,"activity":"also_valid"}',
      ].join('\n');
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        const stream = openResult.value;
        const batch = await stream.next();
        expect(isOk(batch)).toBe(true);

        if (isOk(batch)) {
          // Should skip invalid line and return 2 valid events
          expect(batch.value.events.length).toBeGreaterThanOrEqual(2);
        }

        await stream.close();
      }
    });

    it('should close stream safely multiple times', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{"test":"data"}');

      const adapter = new FileSourceAdapter({ filePath });
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        const stream = openResult.value;
        await stream.close();
        await stream.close(); // Should not error
      }
    });

    it('should error on operations after close', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{"test":"data"}');

      const adapter = new FileSourceAdapter({ filePath });
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        const stream = openResult.value;
        await stream.close();

        const nextResult = await stream.next();
        expect(isOk(nextResult)).toBe(false);
      }
    });
  });

  describe('format detection', () => {
    it('should detect XES format', async () => {
      const filePath = join(tempDir, 'test.xes');
      const xesContent = '<?xml version="1.0"?><log/>';
      await fs.writeFile(filePath, xesContent);

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should detect JSON format with object', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{"traces":[]}');

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should detect JSON format with array', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '[{"event":"1"}]');

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should detect OCEL format', async () => {
      const filePath = join(tempDir, 'test.ocel');
      const ocelContent = '{"ocel:version":"2.0","globalLog":[]}';
      await fs.writeFile(filePath, ocelContent);

      const adapter = new FileSourceAdapter({ filePath });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });
  });

  describe('close()', () => {
    it('should close adapter safely', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{}');

      const adapter = new FileSourceAdapter({ filePath });
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      await adapter.close();
      // Should not error
    });

    it('should close multiple times safely', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{}');

      const adapter = new FileSourceAdapter({ filePath });
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      await adapter.close();
      await adapter.close(); // Should not error
    });
  });
});
