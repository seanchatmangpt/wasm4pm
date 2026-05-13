import { expect } from 'vitest';

expect.extend({
  toBeOneOf(received: unknown, expected: unknown[]) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be one of [${expected.join(', ')}]`
          : `expected ${received} to be one of [${expected.join(', ')}]`,
    };
  },
});

// ─── WASM init (top-level await — vitest setupFiles support this) ─────────────
const _wasmInitPromise: Promise<void> = (async () => {
  try {
    const mod = await import('wasm4pm');
    if (typeof (mod as unknown as { init?: unknown }).init === 'function') {
      await (mod as unknown as { init: () => Promise<void> }).init();
    }
    // bundler target: implicit init, no-op
  } catch (err) {
    // Surface why tests can't init WASM. Don't silently pass.
    console.warn('[setup] WASM init skipped:', err instanceof Error ? err.message : String(err));
  }
})();
// Block test discovery until init resolves
await _wasmInitPromise;
