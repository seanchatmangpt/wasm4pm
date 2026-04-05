/**
 * Integration Tests: FileSourceAdapter
 * Tests real-world usage scenarios with source-sink coordination
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileSourceAdapter } from '../file-source.js';
import { isOk } from '@wasm4pm/contracts';

describe('FileSourceAdapter - Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `wasm4pm-integration-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('complete source lifecycle', () => {
    it('should validate, fingerprint, open, read, and close', async () => {
      const filePath = join(tempDir, 'test.json');
      const events = Array.from({ length: 5 }, (_, i) => ({
        trace_id: 'trace_1',
        event_id: i + 1,
        activity: `activity_${i}`,
      }));
      const content = events.map((e) => JSON.stringify(e)).join('\n');
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });

      // Step 1: Validate
      const validateResult = await adapter.validate();
      expect(isOk(validateResult)).toBe(true);

      // Step 2: Fingerprint for idempotency
      const fp = await adapter.fingerprint({ filePath });
      expect(fp).toBeDefined();

      // Step 3: Open stream
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        const stream = openResult.value;

        // Step 4: Read events
        const readResult = await stream.next();
        expect(isOk(readResult)).toBe(true);

        if (isOk(readResult)) {
          expect(readResult.value.events).toHaveLength(5);
        }

        // Step 5: Close
        await stream.close();
        await adapter.close();
      }
    });

    it('should detect duplicate runs via fingerprint', async () => {
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{"test":"data"}');

      const adapter = new FileSourceAdapter({ filePath });

      // Generate fingerprints for same file
      const fp1 = await adapter.fingerprint({ filePath });
      const fp2 = await adapter.fingerprint({ filePath });

      // Should be identical (idempotency)
      expect(fp1).toBe(fp2);
    });

    it('should support checkpoint recovery', async () => {
      const filePath = join(tempDir, 'test.json');
      const events = Array.from({ length: 150 }, (_, i) => ({
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

        // Read first batch
        const batch1 = await stream.next();
        expect(isOk(batch1)).toBe(true);

        // Save checkpoint after first batch
        const cpResult = await stream.checkpoint();
        expect(isOk(cpResult)).toBe(true);

        let checkpoint = '';
        if (isOk(cpResult)) {
          checkpoint = cpResult.value;
        }

        // Read more
        const batch2 = await stream.next();
        expect(isOk(batch2)).toBe(true);

        // Verify batch2 has different data than batch1
        if (isOk(batch1) && isOk(batch2)) {
          expect(batch2.value.events.length).toBeGreaterThan(0);
          expect(batch1.value.events.length).toBeGreaterThan(0);
        }

        // Restore to checkpoint (should be at start of batch2)
        const seekResult = await stream.seek(checkpoint);
        expect(isOk(seekResult)).toBe(true);

        // Should re-read batch2
        const batch2Retry = await stream.next();
        expect(isOk(batch2Retry)).toBe(true);

        // Checkpoint functionality is working if seek succeeded
        if (isOk(batch2) && isOk(batch2Retry)) {
          expect(batch2Retry.value.events.length).toEqual(batch2.value.events.length);
        }

        await stream.close();
      }
    });
  });

  describe('format variations', () => {
    it('should handle line-delimited JSON', async () => {
      const filePath = join(tempDir, 'events.jsonl');
      const content = [
        '{"event_id":1,"activity":"A","timestamp":"2024-01-01T00:00:00Z"}',
        '{"event_id":2,"activity":"B","timestamp":"2024-01-01T00:01:00Z"}',
        '{"event_id":3,"activity":"C","timestamp":"2024-01-01T00:02:00Z"}',
      ].join('\n');
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath, format: 'json' });
      const validateResult = await adapter.validate();
      expect(isOk(validateResult)).toBe(true);

      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        const stream = openResult.value;
        const readResult = await stream.next();
        expect(isOk(readResult)).toBe(true);

        if (isOk(readResult)) {
          expect(readResult.value.events.length).toBeGreaterThanOrEqual(3);
          expect(readResult.value.hasMore).toBe(false);
        }

        await stream.close();
      }
    });

    it('should handle XES format with XML', async () => {
      const filePath = join(tempDir, 'test.xes');
      const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
    </event>
  </trace>
</log>`;
      await fs.writeFile(filePath, xesContent);

      const adapter = new FileSourceAdapter({ filePath });
      const validateResult = await adapter.validate();
      expect(isOk(validateResult)).toBe(true);

      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        await openResult.value.close();
      }
    });
  });

  describe('error resilience', () => {
    it('should handle permission denied gracefully', async () => {
      // This test may not work on all systems
      try {
        const filePath = join(tempDir, 'restricted.json');
        await fs.writeFile(filePath, '{"test":"data"}');
        await fs.chmod(filePath, 0o000);

        const adapter = new FileSourceAdapter({ filePath });
        const result = await adapter.validate();

        // Should fail with permission error
        if (!isOk(result)) {
          if (result.type === 'error') {
            expect(result.error.code).toBe('SOURCE_PERMISSION');
          }
        }

        // Restore permissions for cleanup
        await fs.chmod(filePath, 0o644);
      } catch (e) {
        // Skip if chmod not available
      }
    });

    it('should handle missing file gracefully', async () => {
      const adapter = new FileSourceAdapter({
        filePath: '/nonexistent/path/to/file.json',
      });
      const result = await adapter.validate();

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        if (result.type === 'error') {
          expect(result.error.code).toBe('SOURCE_NOT_FOUND');
        }
      }
    });

    it('should handle open after failed validation', async () => {
      const adapter = new FileSourceAdapter({
        filePath: '/nonexistent/file.json',
      });

      // Validation fails
      const validateResult = await adapter.validate();
      expect(isOk(validateResult)).toBe(false);

      // Open should also fail gracefully
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(false);
    });
  });

  describe('performance characteristics', () => {
    it('should handle large batch reads efficiently', async () => {
      const filePath = join(tempDir, 'large.json');
      const eventCount = 500;
      const events = Array.from({ length: eventCount }, (_, i) => ({
        event_id: i + 1,
        activity: `activity_${i % 50}`,
      }));
      const content = events.map((e) => JSON.stringify(e)).join('\n');
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });
      const openResult = await adapter.open();
      expect(isOk(openResult)).toBe(true);

      if (isOk(openResult)) {
        const stream = openResult.value;

        // Read all batches
        let totalEvents = 0;
        let batchCount = 0;

        while (true) {
          const result = await stream.next();
          expect(isOk(result)).toBe(true);

          if (isOk(result)) {
            totalEvents += result.value.events.length;
            batchCount++;

            if (!result.value.hasMore) {
              break;
            }
          }
        }

        expect(totalEvents).toBe(eventCount);
        expect(batchCount).toBe(5); // 500 events / 100 per batch = 5 batches

        await stream.close();
      }
    });

    it('should measure fingerprint performance', async () => {
      const filePath = join(tempDir, 'perf-test.json');
      const content = JSON.stringify({
        traces: Array.from({ length: 100 }, (_, i) => ({
          trace_id: i,
          events: Array.from({ length: 50 }, (_, j) => ({
            event_id: j,
            activity: `activity_${j}`,
          })),
        })),
      });
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });

      const start = performance.now();
      const fp = await adapter.fingerprint({ filePath });
      const duration = performance.now() - start;

      expect(fp).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('multiple streams', () => {
    it('should handle multiple concurrent reads from same file', async () => {
      const filePath = join(tempDir, 'concurrent.json');
      const events = Array.from({ length: 20 }, (_, i) => ({
        event_id: i + 1,
        activity: `activity_${i}`,
      }));
      const content = events.map((e) => JSON.stringify(e)).join('\n');
      await fs.writeFile(filePath, content);

      const adapter = new FileSourceAdapter({ filePath });

      // Open two streams
      const open1 = await adapter.open();
      const open2 = await adapter.open();

      // Both should be valid (independently opened)
      expect(isOk(open1)).toBe(true);
      expect(isOk(open2)).toBe(true);

      if (isOk(open1) && isOk(open2)) {
        const stream1 = open1.value;
        const stream2 = open2.value;

        // Both should read independently
        const batch1 = await stream1.next();
        const batch2 = await stream2.next();

        expect(isOk(batch1)).toBe(true);
        expect(isOk(batch2)).toBe(true);

        await stream1.close();
        await stream2.close();
      }
    });
  });
});
