/**
 * unit/bootstrap-error-codes-contract.test.ts
 *
 * Mutation-detection regression: verifies that ALL error codes emitted by
 * Engine.bootstrap() on failure belong to the documented set.
 *
 * Mutation targeted: changing 'BOOTSTRAP_FAILED' → arbitrary string in the
 * outer catch block of bootstrap() (engine.ts ~line 354).
 *
 * The existing integration test "should provide helpful error message on
 * bootstrap failure" only asserts codes.toContain('BOOTSTRAP_FAILED'), which
 * SURVIVED the mutation because the inner .catch at line 302 still adds
 * BOOTSTRAP_FAILED (unchanged). This test asserts that EVERY recorded error
 * code is a known, documented code — catching any stray string injected by
 * the outer handleEngineError() call.
 */

import { describe, it, expect, vi } from 'vitest';
import { createSimpleEngine } from '../../engine.js';
import type { Kernel } from '../../engine.js';

// Unit test: vi.mock() is permitted here (unit/ directory).
vi.mock('../../bootstrap.js', async () => {
  const actual = await vi.importActual<typeof import('../../bootstrap.js')>('../../bootstrap.js');
  return {
    ...actual,
    bootstrapEngine: vi.fn(async (kernel: Kernel) => {
      await kernel.init();
      if (!kernel.isReady()) {
        throw new Error('Kernel initialization failed: kernel not ready');
      }
      return {
        wasmModule: { memory: { buffer: new ArrayBuffer(1024), maximum: 256 } },
        durationMs: 1,
      };
    }),
  };
});

/** Kernel that always throws a non-timeout error on init. */
class FailingKernel implements Kernel {
  async init() { throw new Error('Kernel init failed'); }
  async shutdown() {}
  isReady() { return false; }
}

/**
 * Allowed bootstrap error codes per the documented error taxonomy.
 * Any code NOT in this set is a contract violation (Rank-2 domain contract).
 */
const ALLOWED_BOOTSTRAP_ERROR_CODES = new Set([
  'BOOTSTRAP_FAILED',
  'BOOTSTRAP_TIMEOUT',
  'WASM_FILE_NOT_FOUND',
  'WASM_CORRUPT_BINARY',
  'WASM_MISSING_EXPORTS',
  'WASM_LOAD_FAILED',
]);

describe('Engine.bootstrap() — error code contract (Rank-2 domain contract)', () => {
  it('all recorded error codes on bootstrap failure are documented codes', async () => {
    const engine = createSimpleEngine(new FailingKernel());

    try {
      await engine.bootstrap();
      expect.fail('Expected bootstrap() to throw');
    } catch {
      const status = engine.status();
      expect(status.errors.length).toBeGreaterThanOrEqual(1);

      const codes = status.errors.map((e) => e.code);

      // Every code must be in the allowed set — catches any stray string
      // injected by the outer catch's handleEngineError() call.
      for (const code of codes) {
        expect(
          ALLOWED_BOOTSTRAP_ERROR_CODES.has(code),
          `Unexpected error code '${code}' in status.errors. ` +
            `Allowed codes: ${[...ALLOWED_BOOTSTRAP_ERROR_CODES].join(', ')}`
        ).toBe(true);
      }

      // BOOTSTRAP_FAILED must always be present (inner catch regression guard).
      expect(codes).toContain('BOOTSTRAP_FAILED');
    }
  });

  it('outer-catch error code is not an undocumented string (mutation guard)', async () => {
    // Regression for the specific mutation applied: outer catch changed from
    // 'BOOTSTRAP_FAILED' to 'BOOTSTRAP_TIMEOUT_BAD'.  Pin that exact string
    // so any similar mutation is immediately caught.
    const engine = createSimpleEngine(new FailingKernel());

    try {
      await engine.bootstrap();
      expect.fail('Expected bootstrap() to throw');
    } catch {
      const codes = engine.status().errors.map((e) => e.code);
      expect(codes).not.toContain('BOOTSTRAP_TIMEOUT_BAD');
    }
  });
});
