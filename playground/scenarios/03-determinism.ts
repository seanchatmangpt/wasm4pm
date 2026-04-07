/**
 * Scenario: Determinism — same input → stable hash
 *
 * Dev action simulated: "I just added a new field to ExecutionPlan. Is it
 * stable (same value every run) or unstable (like a UUID or timestamp)?
 * If unstable, I need to add it to the UNSTABLE_FIELDS set in determinism.ts."
 *
 * checkDeterminism() runs the producer N times and compares stable hashes.
 * If a field's value changes between runs it shows up in result.unstableFields.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { checkDeterminism, stableReceiptHash, receiptsMatch } from '@wasm4pm/testing';

// Lazy-load planner
let planFn: ((config: unknown) => { id: string; hash: string; steps: unknown[] }) | null = null;

beforeAll(async () => {
  try {
    const mod = await import('@wasm4pm/planner');
    planFn = (config: unknown) => mod.plan(config as Parameters<typeof mod.plan>[0]) as { id: string; hash: string; steps: unknown[] };
    console.info('[determinism] @wasm4pm/planner loaded');
  } catch {
    console.warn('[determinism] @wasm4pm/planner not available — tests will skip');
    console.warn('[determinism] Run: cd packages/planner && npm run build');
  }
});

function skipIfNotWired(): boolean {
  if (!planFn) {
    console.warn('[determinism] planner not wired — skipping');
    return true;
  }
  return false;
}

const BASE_CONFIG = { version: '1.0', source: { kind: 'file', format: 'xes' }, execution: { profile: 'fast' } } as const;

// ── Plan hash stability ───────────────────────────────────────────────────────

describe('determinism: plan hash stability', () => {
  it('same config produces identical plan hash across 5 calls', async () => {
    if (skipIfNotWired()) return;
    const hashes = Array.from({ length: 5 }, () => planFn!(BASE_CONFIG).hash);
    const unique = new Set(hashes);
    if (unique.size !== 1) {
      console.error('[determinism] plan hash is non-deterministic!');
      console.error('  Distinct hashes:', [...unique]);
      console.error('  → Check computePlanHash() in planner.ts for time-dependent or random inputs');
    }
    expect(unique.size, `Expected 1 unique hash, got ${unique.size}: ${[...unique].join(', ')}`).toBe(1);
    console.info('[determinism] stable hash:', [...unique][0]!.slice(0, 12));
  });

  it('different profiles produce different plan hashes', async () => {
    if (skipIfNotWired()) return;
    const hashFast = planFn!({ ...BASE_CONFIG, execution: { profile: 'fast' } }).hash;
    const hashQuality = planFn!({ ...BASE_CONFIG, execution: { profile: 'quality' } }).hash;
    expect(hashFast).not.toBe(hashQuality);
    console.info('[determinism] fast:', hashFast.slice(0, 8), '≠ quality:', hashQuality.slice(0, 8));
  });

  it('plan id (UUID) changes between calls but hash stays stable', async () => {
    if (skipIfNotWired()) return;
    const p1 = planFn!(BASE_CONFIG);
    const p2 = planFn!(BASE_CONFIG);
    expect(p1.id).not.toBe(p2.id);   // UUIDs differ — expected
    expect(p1.hash).toBe(p2.hash);   // content hash matches — expected
    console.info('[determinism] plan ids differ (expected):', p1.id.slice(0, 8), '≠', p2.id.slice(0, 8));
  });
});

// ── Synthetic receipt determinism ─────────────────────────────────────────────

describe('determinism: synthetic receipt hash stability', () => {
  function makeReceipt(profile: string) {
    if (!planFn) throw new Error('planFn not initialized');
    const p = planFn({ version: '1.0', source: { kind: 'file', format: 'xes' }, execution: { profile } });
    return {
      // Stable fields — should hash identically across runs
      status: 'success',
      plan_hash: p.hash,
      profile,
      step_count: p.steps.length,
      // Unstable fields — stripped by stableReceiptHash
      run_id: `run-${Math.random().toString(36).slice(2)}`,
      start_time: new Date().toISOString(),
      duration_ms: Math.random() * 500,
    };
  }

  it('same config produces identical stable hash across 5 receipts', async () => {
    if (skipIfNotWired()) return;
    const result = await checkDeterminism(() => Promise.resolve(makeReceipt('fast')), 5);
    if (!result.passed) {
      console.error('[determinism] receipt hash is non-deterministic!');
      console.error('  Unstable fields detected:', result.unstableFields);
      console.error('  → If a field is intentionally non-deterministic (like a new UUID field),');
      console.error('    add it to UNSTABLE_FIELDS in packages/testing/src/harness/determinism.ts');
    }
    expect(result.passed, result.details).toBe(true);
    expect(result.stableFields).toContain('status');
    expect(result.stableFields).toContain('plan_hash');
    expect(result.unstableFields).toContain('run_id');
    expect(result.unstableFields).toContain('duration_ms');
    console.info('[determinism] stable fields:', result.stableFields);
    console.info('[determinism] unstable fields (expected):', result.unstableFields);
  });

  it('receiptsMatch() ignores run_id and duration_ms', async () => {
    if (skipIfNotWired()) return;
    const r1 = makeReceipt('balanced');
    const r2 = makeReceipt('balanced');
    r1.run_id = 'run-aaaa';
    r2.run_id = 'run-bbbb';
    r1.duration_ms = 10;
    r2.duration_ms = 9999;
    expect(receiptsMatch(r1, r2)).toBe(true);
    console.info('[determinism] receiptsMatch correctly ignores run_id and duration_ms');
  });

  it('different profiles produce different stable hashes', async () => {
    if (skipIfNotWired()) return;
    const rFast = makeReceipt('fast');
    const rBalanced = makeReceipt('balanced');
    const hFast = stableReceiptHash(rFast);
    const hBalanced = stableReceiptHash(rBalanced);
    expect(hFast).not.toBe(hBalanced);
    console.info('[determinism] hashes differ by profile (correct):', hFast.slice(0, 8), '≠', hBalanced.slice(0, 8));
  });
});

// ── Harness self-check ────────────────────────────────────────────────────────

describe('determinism: harness self-check', () => {
  it('detects a producer that leaks Math.random() into a stable field', async () => {
    const result = await checkDeterminism(
      () => Promise.resolve({
        status: 'success',
        plan_hash: 'fixed-hash-abc123',
        // BUG: computed_score changes on every run
        computed_score: Math.random(),
        run_id: 'run-1',
      }),
      3,
    );
    expect(result.passed).toBe(false);
    expect(result.unstableFields).toContain('computed_score');
    console.info('[determinism:self-check] correctly detected non-deterministic field:', result.unstableFields);
    console.info('[determinism:self-check] → Fix: make the field deterministic, or add to UNSTABLE_FIELDS');
  });
});
