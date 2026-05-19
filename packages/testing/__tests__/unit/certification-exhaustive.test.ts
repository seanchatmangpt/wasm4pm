/**
 * CertificationGate exhaustive threshold invariants — Rank 1-3 oracles
 *
 * Tests the certification gate system (registerGate / runCertification / createGate / formatReport)
 * from packages/testing/src/certification.ts.
 *
 * Oracle hierarchy:
 *   Rank 1 — Mathematical theorem: boundary conditions and AND-logic are deterministic
 *   Rank 2 — Domain contract: output shape, verdict semantics, MCPP admission rule
 *   Rank 3 — Metamorphic relation: monotonicity under stricter / looser thresholds
 *
 * Anti-FM-5 discipline: thresholds are chosen from domain theory (0.0, 0.5, 0.85, 1.0)
 * not derived from the implementation under test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerGate,
  clearGates,
  getRegisteredGates,
  runCertification,
  createGate,
  formatReport,
  type GateResult,
  type CertificationReport,
} from '../../src/certification.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build a gate function that immediately returns a pass/fail result. */
function makeGate(passed: boolean, details?: string): () => GateResult {
  return () => ({
    gate: 'test-gate',
    passed,
    details: details ?? (passed ? 'passed' : 'failed'),
    duration_ms: 0,
  });
}

/**
 * Register a minimal fitness+precision gate pair and return the report.
 * The fitness gate passes only when fitness >= fitnessThreshold.
 * The precision gate passes only when precision >= precisionThreshold.
 */
async function runFitnessGate(
  fitness: number,
  precision: number,
  fitnessThreshold: number,
  precisionThreshold: number
): Promise<CertificationReport> {
  clearGates();
  registerGate('quality:fitness', () => {
    const passed = fitness >= fitnessThreshold;
    return {
      gate: 'quality:fitness',
      passed,
      details: passed
        ? `fitness ${fitness} >= threshold ${fitnessThreshold}`
        : `fitness ${fitness} < threshold ${fitnessThreshold}`,
      duration_ms: 0,
    };
  });
  registerGate('quality:precision', () => {
    const passed = precision >= precisionThreshold;
    return {
      gate: 'quality:precision',
      passed,
      details: passed
        ? `precision ${precision} >= threshold ${precisionThreshold}`
        : `precision ${precision} < threshold ${precisionThreshold}`,
      duration_ms: 0,
    };
  });
  return runCertification('test-version');
}

// ─── Group 1: Rank 1 — Threshold boundary conditions ─────────────────────────

describe('Group 1 — Rank 1 (mathematical): Threshold boundary conditions', () => {
  beforeEach(() => clearGates());

  it('score exactly at threshold → gate passes', async () => {
    const threshold = 0.85;
    const score = 0.85; // exactly at boundary
    registerGate('fitness', () => ({
      gate: 'fitness',
      passed: score >= threshold,
      details: `score ${score} >= ${threshold}`,
      duration_ms: 0,
    }));

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'fitness')!;
    expect(gate.passed).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('score 0.001 below threshold → gate fails', async () => {
    const threshold = 0.85;
    const score = 0.849; // strictly below by ~0.001
    registerGate('fitness', () => ({
      gate: 'fitness',
      passed: score >= threshold,
      details: `score ${score} < ${threshold}`,
      duration_ms: 0,
    }));

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'fitness')!;
    expect(gate.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('score 0.001 above threshold → gate passes', async () => {
    const threshold = 0.85;
    const score = 0.851;
    registerGate('fitness', () => ({
      gate: 'fitness',
      passed: score >= threshold,
      details: `score ${score} > ${threshold}`,
      duration_ms: 0,
    }));

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'fitness')!;
    expect(gate.passed).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('score 0.0 against threshold 0.0 → passes (zero is valid floor)', async () => {
    const threshold = 0.0;
    const score = 0.0;
    registerGate('fitness', () => ({
      gate: 'fitness',
      passed: score >= threshold,
      details: `score ${score} >= ${threshold}`,
      duration_ms: 0,
    }));

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'fitness')!;
    expect(gate.passed).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('score 1.0 against threshold 1.0 → passes (full score at max threshold)', async () => {
    const threshold = 1.0;
    const score = 1.0;
    registerGate('fitness', () => ({
      gate: 'fitness',
      passed: score >= threshold,
      details: `score ${score} >= ${threshold}`,
      duration_ms: 0,
    }));

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'fitness')!;
    expect(gate.passed).toBe(true);
    expect(report.passed).toBe(true);
  });
});

// ─── Group 2: Rank 1 — Multi-dimensional gate (AND logic) ────────────────────

describe('Group 2 — Rank 1 (mathematical): Multi-dimensional gate AND logic', () => {
  const FT = 0.85; // fitness threshold
  const PT = 0.80; // precision threshold

  it('fitness passes + precision passes → overall report passes', async () => {
    const report = await runFitnessGate(0.90, 0.85, FT, PT);

    expect(report.passed).toBe(true);
    expect(report.gates.every((g) => g.passed)).toBe(true);
  });

  it('fitness passes + precision fails → overall report fails (AND logic, not OR)', async () => {
    const report = await runFitnessGate(0.90, 0.70, FT, PT); // precision 0.70 < 0.80

    const fitnessGate = report.gates.find((g) => g.gate === 'quality:fitness')!;
    const precisionGate = report.gates.find((g) => g.gate === 'quality:precision')!;
    expect(fitnessGate.passed).toBe(true);
    expect(precisionGate.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('fitness fails + precision passes → overall report fails', async () => {
    const report = await runFitnessGate(0.70, 0.90, FT, PT); // fitness 0.70 < 0.85

    const fitnessGate = report.gates.find((g) => g.gate === 'quality:fitness')!;
    const precisionGate = report.gates.find((g) => g.gate === 'quality:precision')!;
    expect(fitnessGate.passed).toBe(false);
    expect(precisionGate.passed).toBe(true);
    expect(report.passed).toBe(false);
  });

  it('fitness fails + precision fails → overall report fails', async () => {
    const report = await runFitnessGate(0.60, 0.50, FT, PT);

    expect(report.passed).toBe(false);
    expect(report.gates.some((g) => !g.passed)).toBe(true);
  });
});

// ─── Group 3: Rank 2 — Error/warning output and verdict shape ────────────────

describe('Group 3 — Rank 2 (domain contract): Error/warning output', () => {
  beforeEach(() => clearGates());

  it('failing gate produces a details message naming the failed dimension', async () => {
    registerGate('quality:fitness', () => ({
      gate: 'quality:fitness',
      passed: false,
      details: 'fitness 0.60 < threshold 0.85',
      duration_ms: 0,
    }));

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'quality:fitness')!;
    expect(gate.passed).toBe(false);
    // The details string must name what failed
    expect(gate.details).toContain('fitness');
    expect(gate.details.length).toBeGreaterThan(0);
  });

  it('passing gate produces a non-empty passing details string', async () => {
    registerGate('quality:precision', () => ({
      gate: 'quality:precision',
      passed: true,
      details: 'precision 0.90 >= threshold 0.80',
      duration_ms: 0,
    }));

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'quality:precision')!;
    expect(gate.passed).toBe(true);
    expect(gate.details.length).toBeGreaterThan(0);
  });

  it('GateResult has the required shape: passed, details, gate, duration_ms', async () => {
    registerGate('shape-check', makeGate(true));

    const report = await runCertification('v1');

    const gate = report.gates[0];
    expect(typeof gate.passed).toBe('boolean');
    expect(gate).toHaveProperty('passed');
    expect(gate).toHaveProperty('details');
    expect(gate).toHaveProperty('gate');
    expect(gate).toHaveProperty('duration_ms');
  });

  it('CertificationReport has .passed boolean at top level', async () => {
    registerGate('pass-gate', makeGate(true));

    const report = await runCertification('v1');

    expect(typeof report.passed).toBe('boolean');
    expect(report).toHaveProperty('passed');
    expect(report).toHaveProperty('gates');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('version');
  });

  it('report.passed is true iff every gate passes', async () => {
    registerGate('a', makeGate(true));
    registerGate('b', makeGate(true));
    registerGate('c', makeGate(true));

    const reportAllPass = await runCertification('v1');
    expect(reportAllPass.passed).toBe(true);

    clearGates();
    registerGate('a', makeGate(true));
    registerGate('b', makeGate(false));
    registerGate('c', makeGate(true));

    const reportOneFail = await runCertification('v1');
    expect(reportOneFail.passed).toBe(false);
  });

  it('summary string reflects pass count correctly', async () => {
    registerGate('g1', makeGate(true));
    registerGate('g2', makeGate(false));
    registerGate('g3', makeGate(true));

    const report = await runCertification('v1');

    // summary = "<n>/<total> gates passed"
    expect(report.summary).toContain('2/3');
  });
});

// ─── Group 4: Rank 2 — MCPP admission threshold = 1.0 ───────────────────────

describe('Group 4 — Rank 2 (domain contract): MCPP admission threshold = 1.0', () => {
  it('gate with threshold 1.0 passes only for a perfect score (1.0, 1.0)', async () => {
    const report = await runFitnessGate(1.0, 1.0, 1.0, 1.0);

    expect(report.passed).toBe(true);
  });

  it('fitness 0.999 against threshold 1.0 fails — 0.999 is still an Andon pull', async () => {
    clearGates();
    const fitness = 0.999;
    const threshold = 1.0;
    registerGate('mcpp:fitness', () => ({
      gate: 'mcpp:fitness',
      passed: fitness >= threshold, // strict: 0.999 < 1.0
      details: `fitness ${fitness} < threshold ${threshold} — Andon pull`,
      duration_ms: 0,
    }));

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'mcpp:fitness')!;
    expect(gate.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('precision 0.999 against threshold 1.0 fails', async () => {
    const report = await runFitnessGate(1.0, 0.999, 1.0, 1.0);

    const precisionGate = report.gates.find((g) => g.gate === 'quality:precision')!;
    expect(precisionGate.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('any value strictly below 1.0 in either dimension fails the MCPP gate', async () => {
    const partials: Array<{ fitness: number; precision: number }> = [
      { fitness: 0.99, precision: 1.0 },
      { fitness: 1.0, precision: 0.99 },
      { fitness: 0.5, precision: 1.0 },
      { fitness: 1.0, precision: 0.0 },
    ];

    for (const { fitness, precision } of partials) {
      const report = await runFitnessGate(fitness, precision, 1.0, 1.0);
      expect(report.passed).toBe(false);
    }
  });
});

// ─── Group 5: Rank 3 — Monotonicity (metamorphic relations) ─────────────────

describe('Group 5 — Rank 3 (metamorphic): Monotonicity', () => {
  const DELTA = 0.05;

  it('if a result passes a gate, it also passes any looser gate (lower thresholds)', async () => {
    const fitness = 0.88;
    const precision = 0.82;
    const fitnessThreshold = 0.85;
    const precisionThreshold = 0.80;

    // Passes with (0.85, 0.80)
    const passingReport = await runFitnessGate(fitness, precision, fitnessThreshold, precisionThreshold);
    expect(passingReport.passed).toBe(true);

    // Must also pass with looser thresholds (0.85 - δ, 0.80 - δ)
    const looserReport = await runFitnessGate(
      fitness,
      precision,
      fitnessThreshold - DELTA,
      precisionThreshold - DELTA
    );
    expect(looserReport.passed).toBe(true);
  });

  it('if a result fails a gate, it also fails all stricter gates (higher thresholds)', async () => {
    const fitness = 0.70;
    const precision = 0.65;
    const fitnessThreshold = 0.85;
    const precisionThreshold = 0.80;

    // Fails with (0.85, 0.80)
    const failingReport = await runFitnessGate(fitness, precision, fitnessThreshold, precisionThreshold);
    expect(failingReport.passed).toBe(false);

    // Must also fail with stricter thresholds (0.85 + δ, 0.80 + δ)
    const stricterReport = await runFitnessGate(
      fitness,
      precision,
      fitnessThreshold + DELTA,
      precisionThreshold + DELTA
    );
    expect(stricterReport.passed).toBe(false);
  });

  it('raising both thresholds cannot cause a previously-failing result to pass', async () => {
    const fitness = 0.60;
    const precision = 0.55;

    // A sequence of strictly increasing threshold pairs — all must fail
    const thresholdPairs: Array<readonly [number, number]> = [
      [0.85, 0.80],
      [0.90, 0.85],
      [0.95, 0.90],
      [1.00, 1.00],
    ];

    for (const [ft, pt] of thresholdPairs) {
      const report = await runFitnessGate(fitness, precision, ft, pt);
      expect(report.passed).toBe(false);
    }
  });

  it('lowering both thresholds cannot cause a previously-passing result to fail', async () => {
    const fitness = 0.95;
    const precision = 0.92;

    // A sequence of strictly decreasing threshold pairs — all must pass
    const thresholdPairs: Array<readonly [number, number]> = [
      [0.90, 0.85],
      [0.80, 0.75],
      [0.50, 0.50],
      [0.00, 0.00],
    ];

    for (const [ft, pt] of thresholdPairs) {
      const report = await runFitnessGate(fitness, precision, ft, pt);
      expect(report.passed).toBe(true);
    }
  });
});

// ─── Group 6: Rank 2 — createGate helper, formatReport, and evidence envelope ─

describe('Group 6 — Rank 2 (domain contract): createGate / formatReport / evidence', () => {
  beforeEach(() => clearGates());

  it('createGate registers a gate that appears in getRegisteredGates()', () => {
    createGate('my-check', () => true);

    expect(getRegisteredGates()).toContain('my-check');
  });

  it('createGate with passing check → gate.passed is true', async () => {
    createGate('always-pass', () => true);

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'always-pass')!;
    expect(gate.passed).toBe(true);
  });

  it('createGate with failing check → gate.passed is false', async () => {
    createGate('always-fail', () => false);

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'always-fail')!;
    expect(gate.passed).toBe(false);
  });

  it('createGate async check is supported', async () => {
    createGate('async-pass', async () => {
      return Promise.resolve(true);
    });

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'async-pass')!;
    expect(gate.passed).toBe(true);
  });

  it('runCertification --fast skips performance:benchmarks gate', async () => {
    registerGate('performance:benchmarks', makeGate(false, 'expensive benchmark'));

    const report = await runCertification('v1', { fast: true });

    const bench = report.gates.find((g) => g.gate === 'performance:benchmarks')!;
    // In fast mode it is skipped and reported as passed
    expect(bench.passed).toBe(true);
    expect(bench.details).toContain('Skipped');
  });

  it('formatReport includes version, timestamp, PASSED/FAILED status, and summary', () => {
    const report: CertificationReport = {
      timestamp: '2026-05-17T00:00:00.000Z',
      version: 'v26.5.17',
      gates: [
        { gate: 'g1', passed: true, details: 'ok', duration_ms: 1 },
        { gate: 'g2', passed: false, details: 'nope', duration_ms: 2 },
      ],
      passed: false,
      summary: '1/2 gates passed',
    };

    const text = formatReport(report);

    expect(text).toContain('v26.5.17');
    expect(text).toContain('FAILED');
    expect(text).toContain('1/2 gates passed');
    expect(text).toContain('[PASS]');
    expect(text).toContain('[FAIL]');
  });

  it('formatReport marks a fully-passing report as PASSED', () => {
    const report: CertificationReport = {
      timestamp: '2026-05-17T00:00:00.000Z',
      version: 'v26.5.17',
      gates: [{ gate: 'g1', passed: true, details: 'ok', duration_ms: 0 }],
      passed: true,
      summary: '1/1 gates passed',
    };

    const text = formatReport(report);

    expect(text).toContain('PASSED');
    expect(text).not.toContain('FAILED');
  });

  it('report evidence envelope contains corpus_hash, wasm_build_profile, and run_environment', async () => {
    registerGate('dummy', makeGate(true));

    const report = await runCertification('v1', {
      wasmBuildProfile: 'browser',
      featureFlags: ['feature-ml', 'feature-ocel'],
    });

    expect(report.evidence).toBeDefined();
    expect(typeof report.evidence!.corpus_hash).toBe('string');
    expect(report.evidence!.corpus_hash.length).toBeGreaterThan(0);
    expect(report.evidence!.wasm_build_profile).toBe('browser');
    expect(report.evidence!.feature_flags).toContain('feature-ml');
    expect(report.evidence!.feature_flags).toContain('feature-ocel');
    expect(report.evidence!.run_environment).toBeDefined();
    expect(typeof report.evidence!.run_environment.node_version).toBe('string');
    expect(typeof report.evidence!.run_environment.platform).toBe('string');
    expect(typeof report.evidence!.run_environment.arch).toBe('string');
  });

  it('corpus_hash changes when gate set changes (structural sensitivity)', async () => {
    registerGate('gate-alpha', makeGate(true));
    const report1 = await runCertification('v1');

    clearGates();
    registerGate('gate-beta', makeGate(true));
    const report2 = await runCertification('v1');

    // Different gate names → different corpus_hash
    expect(report1.evidence!.corpus_hash).not.toBe(report2.evidence!.corpus_hash);
  });

  it('corpus_hash is stable across two runs with the same gate set', async () => {
    registerGate('stable-gate', makeGate(true));

    const report1 = await runCertification('v1');
    const report2 = await runCertification('v1');

    expect(report1.evidence!.corpus_hash).toBe(report2.evidence!.corpus_hash);
  });
});

// ─── Group 7: Rank 1 — Exception safety ──────────────────────────────────────

describe('Group 7 — Rank 1 (mathematical): Exception safety', () => {
  beforeEach(() => clearGates());

  it('a gate that throws is recorded as failed, not as unhandled rejection', async () => {
    registerGate('throws-gate', () => {
      throw new Error('boom — simulated gate failure');
    });

    // Must not throw at the runCertification level
    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'throws-gate')!;
    expect(gate.passed).toBe(false);
    expect(gate.details).toContain('Gate threw');
    expect(gate.details).toContain('boom');
    expect(report.passed).toBe(false);
  });

  it('a throwing gate does not prevent other gates from running', async () => {
    registerGate('throws-gate', () => {
      throw new Error('simulated failure');
    });
    // Register with explicit gate name to avoid the makeGate helper's fixed 'test-gate' name
    registerGate('ok-gate', () => ({ gate: 'ok-gate', passed: true, details: 'survived', duration_ms: 0 }));

    const report = await runCertification('v1');

    expect(report.gates).toHaveLength(2);
    const okGate = report.gates.find((g) => g.gate === 'ok-gate')!;
    expect(okGate).toBeDefined();
    expect(okGate.passed).toBe(true);
    expect(okGate.details).toBe('survived');
  });

  it('an async gate that rejects is captured as a failed gate', async () => {
    registerGate('async-throws', async () => {
      throw new Error('async boom');
    });

    const report = await runCertification('v1');

    const gate = report.gates.find((g) => g.gate === 'async-throws')!;
    expect(gate.passed).toBe(false);
    expect(gate.details).toContain('async boom');
  });
});
