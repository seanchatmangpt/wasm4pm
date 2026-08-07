import { describe, expect, it } from 'vitest';
import { NounVerbError } from '../errors.js';
import { serializeJson } from '../output.js';
import { readBoundedStdin } from '../stdin.js';

describe('resource guards', () => {
  it('refuses top-level values that cannot satisfy the JSON stdout contract', () => {
    expect(() => serializeJson(undefined, 1024)).toThrow(/OUTPUT_NOT_JSON_SERIALIZABLE/);
    expect(() => serializeJson(() => undefined, 1024)).toThrow(/OUTPUT_NOT_JSON_SERIALIZABLE/);
  });

  it('refuses output larger than the admitted byte ceiling', () => {
    try {
      serializeJson({ payload: 'x'.repeat(128) }, 32);
      throw new Error('expected output guard');
    } catch (error) {
      expect(error).toBeInstanceOf(NounVerbError);
      expect((error as NounVerbError).code).toBe('GUARD_EXCEEDED');
      expect((error as Error).message).toMatch(/OUTPUT_SIZE_GUARD_EXCEEDED/);
    }
  });

  it('serializes bounded JSON deterministically', () => {
    expect(serializeJson({ ok: true }, 1024)).toBe('{\n  "ok": true\n}');
  });

  it('refuses stdin after the admitted byte ceiling', async () => {
    async function* source(): AsyncGenerator<Buffer> {
      yield Buffer.from('1234');
      yield Buffer.from('5678');
    }

    await expect(
      readBoundedStdin(source(), { maxBytes: 7, timeoutMs: 1000 })
    ).rejects.toMatchObject({
      code: 'GUARD_EXCEEDED',
    });
  });

  it('refuses stdin that does not complete before the deadline', async () => {
    const source: AsyncIterable<Buffer> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<Buffer>>(() => undefined),
        };
      },
    };

    await expect(
      readBoundedStdin(source, { maxBytes: 1024, timeoutMs: 10 })
    ).rejects.toMatchObject({
      code: 'DEADLINE_EXCEEDED',
    });
  });
});
