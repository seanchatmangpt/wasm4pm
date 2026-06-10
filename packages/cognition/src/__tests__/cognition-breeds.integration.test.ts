/**
 * Integration tests for all 8 non-eliza cognition breeds.
 *
 * NO `vi.mock('../init.js')` — FM-5 compliance. These tests MUST fail if the
 * WASM `pkg/` is deleted (and the pnpm hard-copy is also deleted; see
 * `.claude/rules/cognition-contracts.md` "FM-5 cleanup ritual").
 *
 * Each describe asserts a Rank-2 *domain-contract* oracle for that breed, not
 * just `status === 'ok'`. If a breed fails its oracle on minimal input, the
 * test should fail honestly so we can flag it — do NOT soften.
 */

import { describe, it, expect } from 'vitest';
import * as fixtures from './fixtures/breed-inputs.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;

describe('cbr breed integration', () => {
  it('selects a case via Jaccard similarity', async () => {
    const result = (await fixtures.runBreed(
      'cbr',
      fixtures.minimalCbrInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    // BreedOutput.breed serializes as PascalCase (Rust enum Debug-derived).
    expect(result.output.breed).toBe('Cbr');
    expect(result.output.explanation.length).toBeGreaterThan(0);
    // Rank-2: cbr must select a case; with minimalCbrInput the offline/small
    // query exactly matches case-edge -> "edge-local".
    expect(result.output.selected).toBe('edge-local');
  });
});

describe('dendral breed integration', () => {
  it('eliminates candidates via constraint facts', async () => {
    const result = (await fixtures.runBreed(
      'dendral',
      fixtures.minimalDendralInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Dendral');
    // Rank-2: at least one candidate eliminated WITH a non-empty reason.
    const eliminated = result.output.candidates.filter(
      (c: { eliminated: boolean; elimination_reason?: string }) =>
        c.eliminated && c.elimination_reason && c.elimination_reason.length > 0
    );
    expect(eliminated.length).toBeGreaterThan(0);
  });
});

describe('strips breed integration', () => {
  it('produces a non-empty plan for the Sussman anomaly', async () => {
    const result = (await fixtures.runBreed(
      'strips',
      fixtures.minimalStripsInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Strips');
    // Rank-2: explanation mentions an action id from input.rules.
    const actionIds = ['unstack-C-from-A', 'stack-B-on-C', 'stack-A-on-B'];
    const mentioned = actionIds.some((a) =>
      (result.output.explanation as string).includes(a)
    );
    expect(mentioned).toBe(true);
    // selected encodes the plan as comma-joined action ids.
    expect(typeof result.output.selected).toBe('string');
    expect((result.output.selected as string).length).toBeGreaterThan(0);
  });
});

describe('prolog breed integration', () => {
  it('admits a query over Horn-clause facts', async () => {
    const input = fixtures.minimalPrologInput();
    const result = (await fixtures.runBreed('prolog', input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Prolog');
    // Rank-2: query "parent=alice" must succeed → selected === 'alice'.
    expect(result.output.selected).toBe('alice');
    // Trace evidence: rule must have been loaded.
    // (inference_trace is part of BreedOutput from Rust; defaulted to [])
    const trace = result.output.inference_trace;
    expect(trace.length).toBeGreaterThan(0);
  });
});

describe('mycin breed integration', () => {
  it('fires production rules and infers a conclusion', async () => {
    const input = fixtures.minimalMycinInput();
    const result = (await fixtures.runBreed('mycin', input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Mycin');
    // Rank-2: at least one rule fired → output.facts contains "diagnosis=flu".
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const hasDiagnosis = facts.some(
      (f) => f.key === 'diagnosis' && f.value === 'flu'
    );
    expect(hasDiagnosis).toBe(true);
  });
});

describe('gps breed integration', () => {
  it('reduces the gap and returns a plan', async () => {
    const result = (await fixtures.runBreed(
      'gps',
      fixtures.minimalGpsInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Gps');
    // Rank-2: explanation mentions the operator id "op-drive".
    expect((result.output.explanation as string).includes('op-drive')).toBe(true);
    expect(result.output.selected).toBe('op-drive');
  });
});

describe('soar breed integration', () => {
  it('selects a candidate via preferences', async () => {
    const result = (await fixtures.runBreed(
      'soar',
      fixtures.minimalSoarInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Soar');
    // Rank-2: best:op-B + prohibit:op-C → selected MUST be op-B.
    expect(result.output.selected).toBe('op-B');
    expect(['op-A', 'op-B', 'op-C']).toContain(result.output.selected);
  });
});

describe('hearsay breed integration', () => {
  it('posts hypotheses and reaches consensus via noisy-OR', async () => {
    const input = fixtures.minimalHearsayInput();
    const result = (await fixtures.runBreed('hearsay', input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Hearsay');
    // Rank-2: knowledge sources fire → output.facts at level "word" exists
    // (derived from the seed-level "phone" facts).
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const hasWord = facts.some((f) => f.key === 'word' && f.value === 'THE');
    expect(hasWord).toBe(true);
    expect(result.output.selected).toBe('word:THE');
  });
});

// =============================================================================
// autoinstinct breed integration tests (FM-5 compliant — no vi.mock)
// =============================================================================

describe('eliza breed integration', () => {
  it('produces a reflective response for an intent', async () => {
    const result = (await fixtures.runBreed(
      'eliza',
      fixtures.minimalElizaInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Eliza');
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
    expect(result.output.explanation.length).toBeGreaterThan(0);
  });
});

describe('autoinstinct_neurosis breed integration', () => {
  it('seeds beliefs, processes stimuli, returns affect summary', async () => {
    const { breed, contract } = fixtures.autoinstinctNeurosisInput();
    const result = (await fixtures.runBreed(breed, contract)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AutoinstinctNeurosis');
    // Rank-2: selected must be a JSON affect state with fear/anger/mistrust
    expect(result.output.selected).toBeTruthy();
    const affectState = JSON.parse(result.output.selected as string);
    expect(typeof affectState.fear).toBe('number');
    expect(typeof affectState.anger).toBe('number');
    expect(typeof affectState.mistrust).toBe('number');
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
    expect(result.output_hash).toBeTruthy();
  });
});

describe('autoinstinct_vision breed integration', () => {
  it('observes blocks-world scene and finds a clear object', async () => {
    const { breed, contract } = fixtures.autoinstinctVisionInput();
    const result = (await fixtures.runBreed(breed, contract)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AutoinstinctVision');
    // Rank-2: B is on top of A → B is the clear object
    expect(result.output.selected).toBe('B');
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
    expect(result.output_hash).toBeTruthy();
  });
});

describe('autoinstinct_semantics breed integration', () => {
  it('extracts Atrans CD primitive from give-sentence intent', async () => {
    const { breed, contract } = fixtures.autoinstinctSemanticsInput();
    const result = (await fixtures.runBreed(breed, contract)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AutoinstinctSemantics');
    // Rank-2: "John give book to Mary" → Atrans act, actor=John, object=book, to=Mary
    expect(result.output.selected).toBeTruthy();
    const frame = JSON.parse(result.output.selected as string);
    expect(frame.act).toBe('Atrans');
    expect(frame.actor).toBe('John');
    expect(frame.object).toBe('book');
    expect(frame.to).toBe('Mary');
    expect(result.output_hash).toBeTruthy();
  });
});

describe('autoinstinct_learning breed integration', () => {
  it('produces a plan that reaches the goal state', async () => {
    const { breed, contract } = fixtures.autoinstinctLearningInput();
    const result = (await fixtures.runBreed(breed, contract)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AutoinstinctLearning');
    // Rank-2: 3 goals, 0 initial facts → plan must reach goal (selected contains "steps to goal")
    expect(result.output.selected).toMatch(/steps to goal/);
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
    expect(result.output_hash).toBeTruthy();
  });
});

describe('htn_planning breed integration', () => {
  it('produces a total-order task decomposition plan', async () => {
    const result = (await fixtures.runBreed('htn_planning', fixtures.minimalHtnPlanningInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('HtnPlanning');
    expect(result.output.selected).toBe('op:hail_taxi,op:pay_taxi');
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// cognition_verify integration (positive + negative oracle)
// =============================================================================

describe('cognition_verify integration', () => {
  it('verifies a clean breed output: only Warning-level adversarial findings', async () => {
    // HONEST FINDING: cognition_verify always emits at least one Warning
    // (BENCHMARK_EXPECTATION_MISSING) on a BreedOutput that has no benchmark
    // metadata. There is no `verified` status path for raw breed outputs in
    // the current adversarial detector set — the adversarial gate is designed
    // for a richer envelope. We assert *no Error/Fatal findings* on a clean
    // prolog output (Rank-2: clean executions produce only informational
    // diagnostics, never hard errors).
    const runResult = (await fixtures.runBreed(
      'prolog',
      fixtures.minimalPrologInput()
    )) as AnyResult;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wasm: any = await import('wasm4pm-cognition' as string);
    const verifyJson = JSON.stringify(runResult.output);
    const raw = wasm.cognition_verify(verifyJson);
    const verifyResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(['verified', 'has_findings']).toContain(verifyResult.status);
    const hardFindings = (verifyResult.findings as Array<{ severity: string }>)
      .filter((f) => f.severity === 'Error' || f.severity === 'Fatal');
    expect(hardFindings).toEqual([]);
  });

  it('flags malformed BreedOutput as `has_findings`', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wasm: any = await import('wasm4pm-cognition' as string);
    const malformed = {
      breed: 'prolog',
      candidates: [],
      facts: [{ key: '', value: '' }],
      explanation: '',
    };
    const raw = wasm.cognition_verify(JSON.stringify(malformed));
    const verifyResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(verifyResult.status).toBe('has_findings');
    expect(verifyResult.findings.length).toBeGreaterThan(0);
  });
});
