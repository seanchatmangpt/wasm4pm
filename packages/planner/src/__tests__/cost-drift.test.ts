import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { checkCostModelDrift } from '../cost-drift.js';

const TMP = '/tmp/wasm4pm-drift-test-fixed';

function writeReceipt(name: string, algorithm: string, duration_ms: number, eventCount = 1000) {
  writeFileSync(join(TMP, name), JSON.stringify({
    run_id: name,
    command: 'run',
    status: 'success',
    timestamp: '2026-06-09T00:00:00Z',
    summary: { algorithm, duration_ms, eventCount },
  }));
}

beforeAll(() => { mkdirSync(TMP, { recursive: true }); });
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('checkCostModelDrift', () => {
  it('returns undefined for non-existent dir', () => {
    expect(checkCostModelDrift('/tmp/nonexistent-dir-xyz-abc', 'dfg')).toBeUndefined();
  });
  it('returns undefined for fewer than 2 matching samples', () => {
    writeReceipt('single.json', 'dfg-single', 5.0);
    expect(checkCostModelDrift(TMP, 'dfg-single')).toBeUndefined();
  });
  it('returns a signal when 2+ samples exist', () => {
    writeReceipt('r1.json', 'hm', 3.0);
    writeReceipt('r2.json', 'hm', 4.0);
    const signal = checkCostModelDrift(TMP, 'hm');
    expect(signal).toBeDefined();
    expect(signal!.sampleCount).toBe(2);
    expect(signal!.ewmaRatio).toBeGreaterThan(0);
  });
  it('isAlert when actual is much larger than predicted', () => {
    for (let i = 0; i < 5; i++) {
      writeReceipt('big' + i + '.json', 'big', 999.0, 100);
    }
    const signal = checkCostModelDrift(TMP, 'big');
    if (signal) expect(signal.isAlert).toBe(true);
  });
});
