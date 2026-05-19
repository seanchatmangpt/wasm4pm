/**
 * degrade-reason-history.test.ts  (unit/)
 *
 * Closes Gap 2: Engine.degrade(error, reason?) persists the reason string in
 * the transition history entry.
 *
 * Before the gap was identified, no test verified that the error.message (or the
 * explicit reason override) was faithfully stored in the LifecycleEvent.reason
 * field for the degraded→* entry.  Without this, post-mortem tooling cannot
 * identify why an engine degraded by inspecting its transition history.
 *
 * Oracle rank: Rank 2 (domain contract) — Engine.degrade(error, reason?) is
 * specified to pass `reason || error.message` as the transition reason.  The
 * contract is authored from the specification, not from the implementation.
 *
 * bootstrap.js is mocked so tests run without a compiled WASM binary.
 * WasmLoader.reset() is called in beforeEach to prevent singleton bleed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSimpleEngine } from '../../index.js';
import type { Kernel } from '../../engine.js';
import { WasmLoader } from '../../wasm-loader.js';

// ── Mock bootstrap so tests run without a compiled WASM binary ────────────────

vi.mock('../../bootstrap.js', async () => {
  const actual = await vi.importActual<typeof import('../../bootstrap.js')>('../../bootstrap.js');
  return {
    ...actual,
    bootstrapEngine: vi.fn(async (kernel: any, _wasmLoader: any) => {
      await kernel.init();
      if (!kernel.isReady()) throw new Error('Kernel not ready');
      return {
        wasmModule: { memory: { buffer: new ArrayBuffer(1024), maximum: 256 } },
        durationMs: 1,
      };
    }),
  };
});

// ── Kernel stub ───────────────────────────────────────────────────────────────

class StubKernel implements Kernel {
  private ready = false;
  async init(): Promise<void> { this.ready = true; }
  async shutdown(): Promise<void> { this.ready = false; }
  isReady(): boolean { return this.ready; }
}

beforeEach(() => { WasmLoader.reset(); });

// ── Gap 2 — Engine.degrade(error) persists reason in transition history ────────

describe('Gap 2 — Engine.degrade(error) persists reason in transition history', () => {
  it('history entry for degraded← has reason equal to the error message when no reason arg given', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    const errorMessage = 'Injected degradation — distinctive error text 9a3b7c';
    await engine.degrade({
      code: 'GAP2_TEST',
      message: errorMessage,
      severity: 'warning',
      recoverable: true,
    });

    const history = engine.getTransitionHistory();
    const degradeEntry = history.find((e) => e.toState === 'degraded')!;

    expect(degradeEntry).toBeDefined();
    // The transition reason must contain the error message
    expect(degradeEntry.reason).toContain(errorMessage);
  });

  it('history entry for degraded← has reason equal to the explicit reason arg when provided', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    const explicitReason = 'Explicit override reason — circuit-breaker open';
    await engine.degrade(
      { code: 'GAP2_TEST', message: 'ignored message', severity: 'warning', recoverable: true },
      explicitReason
    );

    const history = engine.getTransitionHistory();
    const degradeEntry = history.find((e) => e.toState === 'degraded')!;

    expect(degradeEntry).toBeDefined();
    expect(degradeEntry.reason).toContain(explicitReason);
  });

  it('reason is a non-empty string — not undefined, null, or empty string', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    await engine.degrade({
      code: 'GAP2_NONEMPTY',
      message: 'Non-empty error message',
      severity: 'warning',
      recoverable: true,
    });

    const history = engine.getTransitionHistory();
    const degradeEntry = history.find((e) => e.toState === 'degraded')!;

    expect(typeof degradeEntry.reason).toBe('string');
    expect(degradeEntry.reason!.length).toBeGreaterThan(0);
  });

  it('multiple degrade events each record their own distinct reason in history', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    // First degrade
    await engine.degrade({
      code: 'DEGRADE_1',
      message: 'First degradation cause X1',
      severity: 'warning',
      recoverable: true,
    });

    // Recover so we can degrade again
    await engine.recover();

    // Second degrade
    await engine.degrade({
      code: 'DEGRADE_2',
      message: 'Second degradation cause Y2',
      severity: 'warning',
      recoverable: true,
    });

    const history = engine.getTransitionHistory();
    const degradeEntries = history.filter((e) => e.toState === 'degraded');

    expect(degradeEntries).toHaveLength(2);
    expect(degradeEntries[0]!.reason).toContain('First degradation cause X1');
    expect(degradeEntries[1]!.reason).toContain('Second degradation cause Y2');
  });

  it('degrade from uninitialized state is a silent no-op — no history entry added', async () => {
    // Engine.degrade() checks canTransition('degraded') internally.
    // uninitialized → degraded is NOT a valid transition, so degrade() no-ops.
    const engine = createSimpleEngine(new StubKernel());
    expect(engine.state()).toBe('uninitialized');

    const lenBefore = engine.getTransitionHistory().length;
    await engine.degrade({
      code: 'NO_OP',
      message: 'Should not appear in history',
      severity: 'warning',
      recoverable: true,
    });

    expect(engine.getTransitionHistory().length).toBe(lenBefore);
    expect(engine.state()).toBe('uninitialized');
  });

  it('error code is NOT required to appear in reason — only message or explicit reason', async () => {
    // The contract is: reason = explicit_reason_arg || error.message
    // The error code is separate from the reason string.
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    const distinctCode = 'UNIQUE_CODE_ZZZ';
    const distinctMessage = 'Unique message for contract test AAA';
    await engine.degrade({
      code: distinctCode,
      message: distinctMessage,
      severity: 'warning',
      recoverable: true,
    });

    const history = engine.getTransitionHistory();
    const degradeEntry = history.find((e) => e.toState === 'degraded')!;

    // Message must appear in reason
    expect(degradeEntry.reason).toContain(distinctMessage);
    // Code may or may not appear — we do NOT assert its absence,
    // but we confirm the reason is non-empty and includes the message.
    expect(typeof degradeEntry.reason).toBe('string');
  });
});
