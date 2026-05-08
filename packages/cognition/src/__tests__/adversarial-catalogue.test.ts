/**
 * adversarial-catalogue.test.ts — 5 tests for ADVERSARIAL_DETECTORS
 *
 * Oracle rank: Rank 2 (Domain contract — detector count, severity distribution, code uniqueness).
 *
 * Tests import the catalogue directly (no WASM, no spawn).
 * Expected values are domain-specified, not derived from the implementation.
 */

import { describe, it, expect } from 'vitest';
import { ADVERSARIAL_DETECTORS, getAdversarialCatalogue } from '../adversarial/catalogue.js';

describe('adversarial catalogue', () => {
  it('exports exactly 8 detectors', () => {
    expect(ADVERSARIAL_DETECTORS).toHaveLength(8);
  });

  it('every detector has a non-empty code, severity, and description', () => {
    for (const d of ADVERSARIAL_DETECTORS) {
      expect(typeof d.code).toBe('string');
      expect(d.code.length).toBeGreaterThan(0);
      expect(['fatal', 'error', 'warning', 'info']).toContain(d.severity);
      expect(typeof d.description).toBe('string');
      expect(d.description.length).toBeGreaterThan(0);
    }
  });

  it('severity distribution is 5 fatal, 2 error, 1 warning', () => {
    const counts = ADVERSARIAL_DETECTORS.reduce(
      (acc, d) => {
        acc[d.severity] = (acc[d.severity] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    expect(counts['fatal']).toBe(5);
    expect(counts['error']).toBe(2);
    expect(counts['warning']).toBe(1);
  });

  it('all 8 canonical codes are present (no substitutions)', () => {
    const CANONICAL_CODES = [
      'STUB_GATE_PASS',
      'HUMAN_OUTPUT_USED_AS_AUTHORITY',
      'MISSING_RUNTIME_EVIDENCE',
      'CENTRAL_EVENT_FIREHOSE_REINTRODUCED',
      'AGENT_SELF_CERTIFIES',
      'BENCHMARK_EXPECTATION_MISSING',
      'REPAIR_WEAKENS_GATE',
      'REPLAY_BROKEN',
    ];
    const catalogueCodes = ADVERSARIAL_DETECTORS.map((d) => d.code);
    for (const code of CANONICAL_CODES) {
      expect(catalogueCodes).toContain(code);
    }
  });

  it('getAdversarialCatalogue() returns the same detectors as the static export', async () => {
    const dynamic = await getAdversarialCatalogue();
    expect(dynamic).toHaveLength(ADVERSARIAL_DETECTORS.length);
    expect(dynamic).toEqual(ADVERSARIAL_DETECTORS);
  });
});
