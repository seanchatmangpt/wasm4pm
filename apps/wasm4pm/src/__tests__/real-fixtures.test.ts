/**
 * real-fixtures.test.ts — V2 Workstream D
 *
 * Replays captured real-world `wpm trace conform` runs and asserts the
 * deterministic conformance verdict is reproducible from disk.
 *
 * Each fixture under `fixtures/real/<label>/` was captured via:
 *   WASM4PM_CAPTURE_FIXTURE=1 \
 *   WASM4PM_CAPTURE_LABEL=<label> \
 *   wpm trace conform -m <model> -i <ocel>
 *
 * The replay re-runs `checkPowl2Conformance(expected-ocel.json, model.powl.json)`
 * and asserts the verdict + andon_reason + dimension scores match
 * `expected-conform.json` (semantic fields only — timestamps are excluded).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { checkPowl2Conformance } from '../commands/trace.js';
import type { OcelLog, Powl2Model } from '../commands/trace.js';

const REPO_DIR = resolve(__dirname, '..', '..', '..', '..');
const FIXTURES_DIR = resolve(REPO_DIR, 'fixtures', 'real');

interface ExpectedConform {
  verdict: 'Accepted' | 'AndonPull';
  andon_reason?: string;
  fitness: number;
  precision: number;
  required_stage_coverage: number;
  receipt_coverage: number;
  object_lifecycle_validity: number;
}

function listFixtures(): string[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR)
    .filter((name) => {
      const dir = join(FIXTURES_DIR, name);
      return statSync(dir).isDirectory()
        && name.startsWith('trace-conform-')
        && existsSync(join(dir, 'expected-ocel.json'))
        && existsSync(join(dir, 'expected-conform.json'))
        && existsSync(join(dir, 'model.powl.json'));
    });
}

describe('real-fixtures — replay captured wpm trace conform runs', () => {
  const fixtures = listFixtures();

  it('at least one fixture exists under fixtures/real/', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('replay %s matches captured verdict', (label) => {
    const dir = join(FIXTURES_DIR, label);
    const ocel = JSON.parse(readFileSync(join(dir, 'expected-ocel.json'), 'utf8')) as OcelLog;
    const model = JSON.parse(readFileSync(join(dir, 'model.powl.json'), 'utf8')) as Powl2Model;
    const expected = JSON.parse(readFileSync(join(dir, 'expected-conform.json'), 'utf8')) as ExpectedConform;

    const result = checkPowl2Conformance(ocel, model, REPO_DIR);

    expect(result.verdict, `${label}: verdict`).toBe(expected.verdict);
    expect(result.andon_reason, `${label}: andon_reason`).toBe(expected.andon_reason);
    // Dimension scores must match within floating-point tolerance
    expect(result.fitness).toBeCloseTo(expected.fitness, 6);
    expect(result.precision).toBeCloseTo(expected.precision, 6);
    expect(result.required_stage_coverage).toBeCloseTo(expected.required_stage_coverage, 6);
    expect(result.receipt_coverage).toBeCloseTo(expected.receipt_coverage, 6);
    expect(result.object_lifecycle_validity).toBeCloseTo(expected.object_lifecycle_validity, 6);
  });
});
