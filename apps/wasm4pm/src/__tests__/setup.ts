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
    const { WasmLoader } = await import('@wasm4pm/engine');
    const loader = WasmLoader.getInstance();
    await loader.init();
  } catch (err) {
    // Surface why tests can't init WASM. Don't silently pass.
    console.warn('[setup] WASM init skipped:', err instanceof Error ? err.message : String(err));
  }
})();
// Block test discovery until init resolves
await _wasmInitPromise;
