import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readRuntimeCases, mergeMetaCases, type MetaCase } from '../receipt-reader.js';

const TMP = '/tmp/wasm4pm-receipt-reader-test';

function writeRuntimeReceipt(
  name: string,
  algorithm: string,
  duration_ms: number,
  status = 'success',
) {
  writeFileSync(
    join(TMP, name),
    JSON.stringify({
      run_id: name,
      command: 'autopilot',
      timestamp: '2026-06-10T00:00:00Z',
      input_hash: 'a'.repeat(64),
      output_hash: 'b'.repeat(64),
      status,
      summary: { algorithm, duration_ms, eventCount: 1000 },
    }),
  );
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('readRuntimeCases', () => {
  it('returns empty array for non-existent dir', () => {
    expect(readRuntimeCases('/tmp/nonexistent-receipts-dir-zzz')).toEqual([]);
  });

  it('groups receipts by algorithm and averages durations', () => {
    writeRuntimeReceipt('g1.json', 'dfg', 2.0);
    writeRuntimeReceipt('g2.json', 'dfg', 4.0);
    const cases = readRuntimeCases(TMP);
    const dfg = cases.find((c) => c.algorithm === 'dfg');
    expect(dfg).toBeDefined();
    expect(dfg!.sampleCount).toBe(2);
    expect(dfg!.avgDurationMs).toBeCloseTo(3.0);
    expect(dfg!.passRate).toBe(1.0);
  });

  it('failed receipts lower passRate', () => {
    writeRuntimeReceipt('f1.json', 'failing_algo', 1.0, 'success');
    writeRuntimeReceipt('f2.json', 'failing_algo', 1.0, 'error');
    const cases = readRuntimeCases(TMP);
    const algo = cases.find((c) => c.algorithm === 'failing_algo');
    expect(algo!.passRate).toBeCloseTo(0.5);
    expect(algo!.sampleCount).toBe(2);
  });

  it('skips receipts without summary.algorithm or duration_ms', () => {
    writeFileSync(join(TMP, 'incomplete.json'), JSON.stringify({ status: 'success', summary: {} }));
    const cases = readRuntimeCases(TMP);
    expect(cases.every((c) => c.algorithm !== undefined)).toBe(true);
  });
});

describe('mergeMetaCases', () => {
  const corpusCase: MetaCase = {
    algorithm: 'dfg',
    qualityTier: 30,
    avgDurationMs: 1.0,
    passRate: 1.0,
    sampleCount: 4,
  };

  it('returns corpus cases unchanged when runtime is empty', () => {
    expect(mergeMetaCases([corpusCase], [])).toEqual([corpusCase]);
  });

  it('adds runtime-only algorithms', () => {
    const runtime: MetaCase = {
      algorithm: 'new_algo',
      qualityTier: 50,
      avgDurationMs: 2.0,
      passRate: 1.0,
      sampleCount: 1,
    };
    const merged = mergeMetaCases([corpusCase], [runtime]);
    expect(merged.map((c) => c.algorithm).sort()).toEqual(['dfg', 'new_algo']);
  });

  it('blends overlapping algorithms weighted by sampleCount', () => {
    const runtime: MetaCase = {
      algorithm: 'dfg',
      qualityTier: 30,
      avgDurationMs: 5.0,
      passRate: 0.5,
      sampleCount: 4,
    };
    const merged = mergeMetaCases([corpusCase], [runtime]);
    const dfg = merged.find((c) => c.algorithm === 'dfg')!;
    expect(dfg.sampleCount).toBe(8);
    expect(dfg.avgDurationMs).toBeCloseTo(3.0); // (1*4 + 5*4) / 8
    expect(dfg.passRate).toBeCloseTo(0.75); // (1*4 + 0.5*4) / 8
  });

  it('runtime evidence gains weight as samples accumulate', () => {
    const heavyRuntime: MetaCase = {
      algorithm: 'dfg',
      qualityTier: 30,
      avgDurationMs: 10.0,
      passRate: 1.0,
      sampleCount: 36,
    };
    const merged = mergeMetaCases([corpusCase], [heavyRuntime]);
    const dfg = merged.find((c) => c.algorithm === 'dfg')!;
    // 36 runtime samples vs 4 corpus samples → blended mean close to 10
    expect(dfg.avgDurationMs).toBeGreaterThan(8);
  });
});
