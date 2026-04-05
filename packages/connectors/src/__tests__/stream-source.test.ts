/**
 * StreamSourceAdapter Tests
 * Tests for reading event logs from Readable streams
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { StreamSourceAdapter } from '../stream-source.js';
import { isOk } from '@wasm4pm/contracts';

/**
 * Helper: create a Readable from a string
 */
function readableFrom(content: string): Readable {
  return Readable.from([content]);
}

describe('StreamSourceAdapter', () => {
  describe('initialization', () => {
    it('should create adapter with defaults', () => {
      const adapter = new StreamSourceAdapter();
      expect(adapter.kind).toBe('stream');
      expect(adapter.version).toBe('1.0.0');
    });

    it('should have correct capabilities', () => {
      const adapter = new StreamSourceAdapter();
      const caps = adapter.capabilities();
      expect(caps.streaming).toBe(true);
      expect(caps.checkpoint).toBe(true);
      expect(caps.filtering).toBe(false);
    });
  });

  describe('validate()', () => {
    it('should validate with a provided stream', async () => {
      const stream = readableFrom('{"id":1}');
      const adapter = new StreamSourceAdapter({ stream });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should fail when stream is invalid', async () => {
      const adapter = new StreamSourceAdapter({ stream: {} as any });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(false);
    });
  });

  describe('fingerprint()', () => {
    it('should generate consistent fingerprints', async () => {
      const adapter = new StreamSourceAdapter({ label: 'test-stream' });
      const fp1 = await adapter.fingerprint({ id: 1 });
      const fp2 = await adapter.fingerprint({ id: 1 });
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it('should differ based on label', async () => {
      const adapter1 = new StreamSourceAdapter({ label: 'stream-a' });
      const adapter2 = new StreamSourceAdapter({ label: 'stream-b' });
      const fp1 = await adapter1.fingerprint({});
      const fp2 = await adapter2.fingerprint({});
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('open()', () => {
    it('should read newline-delimited JSON from stream', async () => {
      const content = '{"id":1,"activity":"start"}\n{"id":2,"activity":"end"}';
      const stream = readableFrom(content);
      const adapter = new StreamSourceAdapter({ stream });

      const result = await adapter.open();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const eventStream = result.value;
        const batch = await eventStream.next();
        expect(isOk(batch)).toBe(true);
        if (isOk(batch)) {
          expect(batch.value.events).toHaveLength(2);
          expect(batch.value.hasMore).toBe(false);
        }
        await eventStream.close();
      }
    });

    it('should handle single JSON object', async () => {
      const stream = readableFrom('{"id":1}');
      const adapter = new StreamSourceAdapter({ stream });

      const result = await adapter.open();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const eventStream = result.value;
        const batch = await eventStream.next();
        expect(isOk(batch)).toBe(true);
        if (isOk(batch)) {
          expect(batch.value.events).toHaveLength(1);
        }
        await eventStream.close();
      }
    });

    it('should skip invalid JSON lines', async () => {
      const content = '{"id":1}\nnot json\n{"id":2}';
      const stream = readableFrom(content);
      const adapter = new StreamSourceAdapter({ stream });

      const result = await adapter.open();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const eventStream = result.value;
        const batch = await eventStream.next();
        expect(isOk(batch)).toBe(true);
        if (isOk(batch)) {
          expect(batch.value.events).toHaveLength(2);
        }
        await eventStream.close();
      }
    });

    it('should fail on empty stream', async () => {
      const stream = readableFrom('');
      const adapter = new StreamSourceAdapter({ stream });

      const result = await adapter.open();
      expect(isOk(result)).toBe(false);
      if (result.type === 'error') {
        expect(result.error.code).toBe('SOURCE_INVALID');
      }
    });

    it('should handle stream error', async () => {
      const stream = new Readable({
        read() {
          this.destroy(new Error('stream broke'));
        },
      });
      const adapter = new StreamSourceAdapter({ stream });

      const result = await adapter.open();
      expect(isOk(result)).toBe(false);
    });
  });

  describe('EventStream batching', () => {
    it('should batch large streams into 100-event chunks', async () => {
      const events = Array.from({ length: 250 }, (_, i) => JSON.stringify({ id: i })).join('\n');
      const stream = readableFrom(events);
      const adapter = new StreamSourceAdapter({ stream });

      const result = await adapter.open();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const eventStream = result.value;

        const batch1 = await eventStream.next();
        expect(isOk(batch1)).toBe(true);
        if (isOk(batch1)) {
          expect(batch1.value.events).toHaveLength(100);
          expect(batch1.value.hasMore).toBe(true);
        }

        const batch2 = await eventStream.next();
        expect(isOk(batch2)).toBe(true);
        if (isOk(batch2)) {
          expect(batch2.value.events).toHaveLength(100);
          expect(batch2.value.hasMore).toBe(true);
        }

        const batch3 = await eventStream.next();
        expect(isOk(batch3)).toBe(true);
        if (isOk(batch3)) {
          expect(batch3.value.events).toHaveLength(50);
          expect(batch3.value.hasMore).toBe(false);
        }

        await eventStream.close();
      }
    });

    it('should support checkpoint and seek', async () => {
      const events = Array.from({ length: 10 }, (_, i) => JSON.stringify({ id: i })).join('\n');
      const stream = readableFrom(events);
      const adapter = new StreamSourceAdapter({ stream });

      const result = await adapter.open();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const eventStream = result.value;

        // Read all
        const batch = await eventStream.next();
        expect(isOk(batch)).toBe(true);

        // Checkpoint
        const cp = await eventStream.checkpoint();
        expect(isOk(cp)).toBe(true);

        // Seek back to start
        const seekResult = await eventStream.seek(JSON.stringify({ cursor: 0 }));
        expect(isOk(seekResult)).toBe(true);

        // Re-read
        const reBatch = await eventStream.next();
        expect(isOk(reBatch)).toBe(true);
        if (isOk(reBatch)) {
          expect(reBatch.value.events).toHaveLength(10);
        }

        await eventStream.close();
      }
    });
  });

  describe('close()', () => {
    it('should close safely before open', async () => {
      const adapter = new StreamSourceAdapter();
      await adapter.close();
    });

    it('should close safely after open', async () => {
      const stream = readableFrom('{"id":1}');
      const adapter = new StreamSourceAdapter({ stream });
      await adapter.open();
      await adapter.close();
      await adapter.close(); // Multiple closes safe
    });
  });
});
