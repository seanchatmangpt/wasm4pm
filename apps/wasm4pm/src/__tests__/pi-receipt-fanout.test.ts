import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitPiReceipt } from '../receipts/_shared.js';

const HEX64 = /^[0-9a-f]{64}$/;
const HEX16 = /^[0-9a-f]{16}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const PI_ALGO_IDS = [
  'alignments',
  'etconformance_precision',
  'monte_carlo_simulation',
  'playout',
  'predict_next_activity',
  'predict_remaining_time',
  'predict_outcome',
  'detect_drift',
  'agentic_pipeline',
];

describe('crown receipt fan-out — field shape', () => {
  for (const algoId of PI_ALGO_IDS) {
    it(`${algoId}: receipt fields are well-formed`, () => {
      const dir = mkdtempSync(join(tmpdir(), `pi-receipt-test-${algoId}-`));
      const input = { algorithm: algoId, test: true };
      const output = { result: 'ok' };

      const receipt = emitPiReceipt(
        algoId,
        JSON.stringify(input),
        JSON.stringify(output),
        dir,
      );

      // Returned object assertions (no FS read required — source of truth)
      expect(typeof receipt.algorithm).toBe('string');
      expect(receipt.algorithm.length).toBeGreaterThan(0);
      expect(receipt.algorithm).toBe(algoId);

      expect(receipt.replay_pointer).toMatch(HEX16);
      expect(receipt.input_hash).toMatch(HEX64);
      expect(receipt.output_hash).toMatch(HEX64);
      expect(receipt.run_id).toMatch(HEX64);
      expect(receipt.timestamp).toMatch(ISO_RE);

      // replay_pointer is the first 16 chars of output_hash
      expect(receipt.replay_pointer).toBe(receipt.output_hash.slice(0, 16));

      // FS round-trip: both files must parse to the same shape
      const latestRaw = readFileSync(join(dir, 'latest.json'), 'utf-8');
      const piLatestRaw = readFileSync(join(dir, `pi-${algoId}-latest.json`), 'utf-8');

      const latest = JSON.parse(latestRaw);
      const piLatest = JSON.parse(piLatestRaw);

      for (const persisted of [latest, piLatest]) {
        expect(persisted.algorithm).toBe(algoId);
        expect(persisted.replay_pointer).toMatch(HEX16);
        expect(persisted.input_hash).toMatch(HEX64);
        expect(persisted.output_hash).toMatch(HEX64);
        expect(persisted.run_id).toMatch(HEX64);
        expect(persisted.timestamp).toMatch(ISO_RE);
      }
    });
  }
});

describe('source-wiring guard — emitCrownReceipt call sites', () => {
  const srcBase = join(import.meta.dirname, '../../src/commands');

  it('conformance.ts includes emitCrownReceipt', () => {
    const src = readFileSync(join(srcBase, 'conformance.ts'), 'utf-8');
    expect(src).toContain('emitCrownReceipt');
  });

  it('simulate.ts includes emitCrownReceipt', () => {
    const src = readFileSync(join(srcBase, 'simulate.ts'), 'utf-8');
    expect(src).toContain('emitCrownReceipt');
  });

  it('predict.ts includes emitCrownReceipt', () => {
    const src = readFileSync(join(srcBase, 'predict.ts'), 'utf-8');
    expect(src).toContain('emitCrownReceipt');
  });

  it('agent/execute.ts includes emitCrownReceipt', () => {
    const src = readFileSync(join(srcBase, 'agent/execute.ts'), 'utf-8');
    expect(src).toContain('emitCrownReceipt');
  });
});

describe('discovery preservation — emitPiReceipt call sites in run.ts', () => {
  it('run.ts contains at least two emitPiReceipt call sites', () => {
    const src = readFileSync(
      join(import.meta.dirname, '../../src/commands/run.ts'),
      'utf-8',
    );
    const matches = src.match(/emitPiReceipt/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
