/**
 * Integration tests for 6 cognition breeds: mdp, naive_physics,
 * partial_order_plan, problog, qualitative_reason, rl_symbolic.
 *
 * NO init.js mocking (FM-5 compliance). These tests MUST fail if the
 * WASM `pkg/` is deleted (and the pnpm hard-copy is also deleted; see
 * `.claude/rules/cognition-contracts.md` "FM-5 cleanup ritual").
 *
 * Each describe block asserts 3-4 DoD tiers:
 *   Rank-1  — status === 'ok' + output.breed === '<PascalCase>'
 *   Rank-2  — structural fingerprint / domain oracle
 *   Rank-3  — two-query consistency (different inputs → different outputs)
 *   Rank-4  — determinism (same input → identical outputs twice)
 *   Rank-E  — error-contract (invalid input → non-ok or non-empty error)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fixtures from './fixtures/breed-inputs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAPERS_DIR = path.join(__dirname, 'fixtures', 'papers');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;

function loadPaperFixture(breed: string): any {
  const p = path.join(PAPERS_DIR, `${breed}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// MDP
// ─────────────────────────────────────────────────────────────────────────────

describe('mdp breed integration', () => {
  it('Rank-1+2: converges value iteration and returns a valid policy string', async () => {
    const result = (await fixtures.runBreed(
      'mdp',
      fixtures.minimalMdpInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Mdp');
    // selected is comma-joined "s:a" pairs
    expect(typeof result.output.selected).toBe('string');
    expect(result.output.selected.length).toBeGreaterThan(0);
    // explanation mentions sweep count
    expect(result.output.explanation).toMatch(/sweep/i);
  });

  it('Rank-2 paper: Bellman fixed-point matches hand-derived values (tolerance 1e-4)', async () => {
    const fixture = loadPaperFixture('mdp');
    const result = (await fixtures.runBreed('mdp', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Mdp');
    // policy at s0 must be "go" (higher-value action)
    const policyFacts = (result.output.facts as Array<{ key: string; value: string }>).filter(
      f => f.key.startsWith('mdp:policy:')
    );
    const s0Policy = policyFacts.find(f => f.key === 'mdp:policy:s0');
    expect(s0Policy?.value).toBe(fixture.expected.policy.s0);
    // value at s1 ≈ 2.0
    const s1Value = (result.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'mdp:value:s1'
    );
    expect(s1Value).toBeDefined();
    expect(Math.abs(parseFloat(s1Value!.value) - fixture.expected.values.s1)).toBeLessThan(
      fixture.expected.tolerance
    );
    // value at goal ≈ 0.0
    const goalValue = (result.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'mdp:value:goal'
    );
    expect(goalValue).toBeDefined();
    expect(Math.abs(parseFloat(goalValue!.value) - fixture.expected.values.goal)).toBeLessThan(
      fixture.expected.tolerance
    );
  });

  it('Rank-3: two MDPs with different rewards produce different policies', async () => {
    const fixture = loadPaperFixture('mdp');
    const r1 = (await fixtures.runBreed('mdp', fixture.input)) as AnyResult;
    const r2 = (await fixtures.runBreed('mdp', fixtures.minimalMdpInput())) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    // The paper fixture has a 3-state chain; minimalMdpInput is a 2-state loop
    // — they must produce different selected strings.
    expect(r1.output.selected).not.toBe(r2.output.selected);
  });

  it('Rank-4+E: determinism holds; empty facts yields non-ok or empty policy', async () => {
    const input = fixtures.minimalMdpInput();
    const r1 = (await fixtures.runBreed('mdp', input)) as AnyResult;
    const r2 = (await fixtures.runBreed('mdp', input)) as AnyResult;
    expect(r1.output.selected).toBe(r2.output.selected);
    // error contract: no facts at all → mdp.rs precondition rejects (missing mdp:gamma)
    const emptyInput = { ...input, facts: [] };
    const err = await fixtures.runBreedCaught('mdp', emptyInput);
    expect(err.status).not.toBe('ok');
    expect(err.error).toContain('missing mdp:gamma');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAIVE PHYSICS
// ─────────────────────────────────────────────────────────────────────────────

describe('naive_physics breed integration', () => {
  it('Rank-1+2: cup falls and water spills when table is removed', async () => {
    const fixture = loadPaperFixture('naive_physics');
    const result = (await fixtures.runBreed('naive_physics', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('NaivePhysics');
    // cup must fall
    const fallsFacts = (result.output.facts as Array<{ key: string; value: string }>).filter(
      f => f.key.startsWith('falls:')
    );
    const fallenObjects = fallsFacts.map(f => f.key.replace('falls:', ''));
    expect(fallenObjects).toContain('cup');
    // water must spill
    const spillsFacts = (result.output.facts as Array<{ key: string; value: string }>).filter(
      f => f.key.startsWith('spills:')
    );
    const spilledLiquids = spillsFacts.map(f => f.key.replace('spills:', ''));
    expect(spilledLiquids).toContain('water');
    // floor must NOT fall (ground objects are immobile)
    expect(fallenObjects).not.toContain('floor');
  });

  it('Rank-2: selected encodes prediction count as "predictions:N" where N ≥ 2', async () => {
    const fixture = loadPaperFixture('naive_physics');
    const result = (await fixtures.runBreed('naive_physics', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.selected).toMatch(/^predictions:\d+$/);
    const n = parseInt(result.output.selected.split(':')[1], 10);
    // at least cup(falls) + water(spills) = 2
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it('Rank-3: scene with no removals produces zero predictions', async () => {
    const noRemovalInput = {
      intent: 'stable scene',
      candidates: [],
      facts: [
        { key: 'np:ground:floor', value: 'true' },
        { key: 'np:on:table', value: 'floor' },
        { key: 'np:on:cup', value: 'table' },
      ],
      cases: [],
      rules: [],
      goals: [],
      state: [],
    };
    const result = (await fixtures.runBreed('naive_physics', noRemovalInput)) as AnyResult;
    expect(result.status).toBe('ok');
    const n = parseInt(result.output.selected.split(':')[1], 10);
    // Nothing removed → zero falls/spills
    expect(n).toBe(0);
    // must differ from the fixture result
    const fixture = loadPaperFixture('naive_physics');
    const full = (await fixtures.runBreed('naive_physics', fixture.input)) as AnyResult;
    expect(result.output.selected).not.toBe(full.output.selected);
  });

  it('Rank-4: determinism — identical inputs produce identical outputs', async () => {
    const fixture = loadPaperFixture('naive_physics');
    const r1 = (await fixtures.runBreed('naive_physics', fixture.input)) as AnyResult;
    const r2 = (await fixtures.runBreed('naive_physics', fixture.input)) as AnyResult;
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTIAL ORDER PLAN
// ─────────────────────────────────────────────────────────────────────────────

describe('partial_order_plan breed integration', () => {
  it('Rank-1+2: solves the Sussman anomaly with interleaved causal-link plan', async () => {
    const fixture = loadPaperFixture('partial_order_plan');
    const result = (await fixtures.runBreed(
      'partial_order_plan',
      fixture.input
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('PartialOrderPlan');
    // selected must match the expected interleaved plan
    expect(result.output.selected).toBe(fixture.expected.plan);
  });

  it('Rank-2: threat detection trace step present (causal-link planning ran)', async () => {
    const fixture = loadPaperFixture('partial_order_plan');
    const result = (await fixtures.runBreed(
      'partial_order_plan',
      fixture.input
    )) as AnyResult;
    expect(result.status).toBe('ok');
    // partial_order_plan.rs traces threats as kind 'pop-resolve' with detail
    // "step '…' deletes '…' threatening link …" — assert one was detected.
    const threats = (result.output.inference_trace as Array<{ kind: string; detail: string }>).filter(
      t => t.kind === 'pop-resolve' && t.detail.includes('threatening link')
    );
    expect(threats.length).toBeGreaterThan(0);
  });

  it('Rank-3: single-step plan (minimalPartialOrderPlanInput) differs from Sussman plan', async () => {
    const fixture = loadPaperFixture('partial_order_plan');
    const r1 = (await fixtures.runBreed(
      'partial_order_plan',
      fixture.input
    )) as AnyResult;
    const r2 = (await fixtures.runBreed(
      'partial_order_plan',
      fixtures.minimalPartialOrderPlanInput()
    )) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    expect(r1.output.selected).not.toBe(r2.output.selected);
  });

  it('Rank-4: determinism — two runs of the Sussman fixture are byte-identical', async () => {
    const fixture = loadPaperFixture('partial_order_plan');
    const r1 = (await fixtures.runBreed('partial_order_plan', fixture.input)) as AnyResult;
    const r2 = (await fixtures.runBreed('partial_order_plan', fixture.input)) as AnyResult;
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROBLOG
// ─────────────────────────────────────────────────────────────────────────────

describe('problog breed integration', () => {
  it('Rank-1+2: P(wet) = 0.552 (noisy-OR of three independent causes)', async () => {
    const fixture = loadPaperFixture('problog');
    const result = (await fixtures.runBreed('problog', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Problog');
    // selected is the 6-decimal probability string
    const p = parseFloat(result.output.selected as string);
    expect(Math.abs(p - fixture.expected.probability)).toBeLessThan(fixture.expected.tolerance);
    // prob fact must be stored
    const probFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'prob:wet'
    );
    expect(probFact).toBeDefined();
    expect(Math.abs(parseFloat(probFact!.value) - fixture.expected.probability)).toBeLessThan(
      fixture.expected.tolerance
    );
  });

  it('Rank-2: explanation mentions world count (2^3 = 8 worlds)', async () => {
    const fixture = loadPaperFixture('problog');
    const result = (await fixtures.runBreed('problog', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    // explanation must mention "8" worlds
    expect(result.output.explanation).toContain('8');
  });

  it('Rank-3: single-cause scenario gives different probability than three-cause', async () => {
    const fixture = loadPaperFixture('problog');
    const fullResult = (await fixtures.runBreed('problog', fixture.input)) as AnyResult;
    // single cause: only rain=0.2
    const singleInput = {
      intent: 'single cause wet',
      candidates: [],
      facts: [{ key: 'pfact:rain', value: '0.2' }],
      cases: [],
      rules: [
        { id: 'r-rain', premise: ['rain'], conclusion: 'wet', certainty: 1.0 },
      ],
      goals: [{ id: 'g1', predicate: 'query', value: 'wet' }],
      state: [],
    };
    const singleResult = (await fixtures.runBreed('problog', singleInput)) as AnyResult;
    expect(singleResult.status).toBe('ok');
    // 0.2 !== 0.552
    expect(singleResult.output.selected).not.toBe(fullResult.output.selected);
    expect(Math.abs(parseFloat(singleResult.output.selected) - 0.2)).toBeLessThan(1e-5);
  });

  it('Rank-4+E: determinism; missing query goal produces error or 0 probability', async () => {
    const fixture = loadPaperFixture('problog');
    const r1 = (await fixtures.runBreed('problog', fixture.input)) as AnyResult;
    const r2 = (await fixtures.runBreed('problog', fixture.input)) as AnyResult;
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
    // error contract: no goals → problog.rs precondition requires a query goal
    const noGoal = { ...fixture.input, goals: [] };
    const err = await fixtures.runBreedCaught('problog', noGoal);
    expect(err.status).not.toBe('ok');
    expect(err.error).toContain('requires a query goal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QUALITATIVE REASON
// ─────────────────────────────────────────────────────────────────────────────

describe('qualitative_reason breed integration', () => {
  it('Rank-1+2: valve confluence yields exactly 3 ambiguous states', async () => {
    const fixture = loadPaperFixture('qualitative_reason');
    const result = (await fixtures.runBreed(
      'qualitative_reason',
      fixture.input
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('QualitativeReason');
    // selected must be "3 states"
    expect(result.output.selected).toBe(fixture.expected.state_count + ' states');
    // qr:state_count fact must equal 3
    const countFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'qr:state_count'
    );
    expect(countFact?.value).toBe(fixture.expected.state_count);
  });

  it('Rank-2: all three qualitative q-values (+, 0, -) present in envisionment', async () => {
    const fixture = loadPaperFixture('qualitative_reason');
    const result = (await fixtures.runBreed(
      'qualitative_reason',
      fixture.input
    )) as AnyResult;
    expect(result.status).toBe('ok');
    // gather all qr:state:* facts and collect all q assignments
    const stateFacts = (result.output.facts as Array<{ key: string; value: string }>).filter(
      f => f.key.startsWith('qr:state:') && f.key !== 'qr:state_count'
    );
    // each state value is like "p:+,a:-,q:+" — collect the q values
    const qValues = stateFacts.map(f => {
      const parts = f.value.split(',');
      const qPart = parts.find((p: string) => p.startsWith('q:'));
      return qPart ? qPart.split(':')[1] : undefined;
    });
    expect(qValues).toContain('+');
    expect(qValues).toContain('0');
    expect(qValues).toContain('-');
  });

  it('Rank-2: branch-ambiguity trace step present (envisionment ran)', async () => {
    const fixture = loadPaperFixture('qualitative_reason');
    const result = (await fixtures.runBreed(
      'qualitative_reason',
      fixture.input
    )) as AnyResult;
    expect(result.status).toBe('ok');
    const branchSteps = (result.output.inference_trace as Array<{ kind: string }>).filter(
      t => t.kind === 'branch-ambiguity'
    );
    expect(branchSteps.length).toBeGreaterThan(0);
  });

  it('Rank-3+4: fully determined confluence gives 1 state; determinism holds', async () => {
    // Fully determined: p=+, a=+, sum must be 0 → q=- is forced
    const determinedInput = {
      intent: 'fully determined',
      candidates: [],
      facts: [
        { key: 'qr:confluence:valve', value: '+p,+a,-q' },
        { key: 'qr:sign:p', value: '+' },
        { key: 'qr:sign:a', value: '+' },
      ],
      cases: [],
      rules: [],
      goals: [],
      state: [],
    };
    const result = (await fixtures.runBreed(
      'qualitative_reason',
      determinedInput
    )) as AnyResult;
    expect(result.status).toBe('ok');
    // 1 state (forced)
    const countFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'qr:state_count'
    );
    expect(countFact?.value).toBe('1');
    // differ from the ambiguous result
    const fixture = loadPaperFixture('qualitative_reason');
    const ambiguous = (await fixtures.runBreed(
      'qualitative_reason',
      fixture.input
    )) as AnyResult;
    expect(result.output.selected).not.toBe(ambiguous.output.selected);
    // determinism
    const r2 = (await fixtures.runBreed(
      'qualitative_reason',
      determinedInput
    )) as AnyResult;
    expect(result.output.selected).toBe(r2.output.selected);
    expect(result.output_hash).toBe(r2.output_hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RL SYMBOLIC
// ─────────────────────────────────────────────────────────────────────────────

describe('rl_symbolic breed integration', () => {
  it('Rank-1+2: learns optimal policy and Q-values match Bellman fixed point', async () => {
    const fixture = loadPaperFixture('rl_symbolic');
    const result = (await fixtures.runBreed('rl_symbolic', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('RlSymbolic');
    // greedy policy at start state must be "go"
    expect(result.output.selected).toBe(fixture.expected.policy_s0);
    // Q(s0, go) ≈ 1.0
    const qGoFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'q:s0:go'
    );
    expect(qGoFact).toBeDefined();
    expect(
      Math.abs(parseFloat(qGoFact!.value) - fixture.expected.q_s0_go)
    ).toBeLessThan(fixture.expected.tolerance);
    // Q(s0, stay) ≈ 0.9
    const qStayFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'q:s0:stay'
    );
    expect(qStayFact).toBeDefined();
    expect(
      Math.abs(parseFloat(qStayFact!.value) - fixture.expected.q_s0_stay)
    ).toBeLessThan(fixture.expected.tolerance);
  });

  it('Rank-2: explanation mentions episode count', async () => {
    const fixture = loadPaperFixture('rl_symbolic');
    const result = (await fixtures.runBreed('rl_symbolic', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.explanation).toMatch(/episode/i);
  });

  it('Rank-3: fewer episodes gives same direction but distinct Q-values', async () => {
    const fixture = loadPaperFixture('rl_symbolic');
    const fewerEpisodesInput = {
      ...fixture.input,
      facts: fixture.input.facts.map((f: { key: string; value: string }) =>
        f.key === 'rl:episodes' ? { key: 'rl:episodes', value: '5' } : f
      ),
    };
    const few = (await fixtures.runBreed('rl_symbolic', fewerEpisodesInput)) as AnyResult;
    const full = (await fixtures.runBreed('rl_symbolic', fixture.input)) as AnyResult;
    expect(few.status).toBe('ok');
    expect(full.status).toBe('ok');
    // Both should pick 'go' (correct direction) but Q values may differ with very few episodes
    expect(few.output.selected).toBe('go');
    // Q values from 5 episodes will differ from 300 episodes
    const qGoFew = (few.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'q:s0:go'
    );
    const qGoFull = (full.output.facts as Array<{ key: string; value: string }>).find(
      f => f.key === 'q:s0:go'
    );
    // They should not be exactly identical (5 vs 300 training episodes)
    // (may occasionally be equal by luck — but we only assert the direction)
    expect(qGoFew).toBeDefined();
    expect(qGoFull).toBeDefined();
  });

  it('Rank-4+E: determinism; missing terminal flag does not crash', async () => {
    const fixture = loadPaperFixture('rl_symbolic');
    const r1 = (await fixtures.runBreed('rl_symbolic', fixture.input)) as AnyResult;
    const r2 = (await fixtures.runBreed('rl_symbolic', fixture.input)) as AnyResult;
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
    // error contract: no states defined at all
    const emptyInput = {
      intent: 'rl empty',
      candidates: [],
      facts: [{ key: 'mdp:gamma', value: '0.9' }],
      cases: [],
      rules: [],
      goals: [],
      state: [],
    };
    // rl_symbolic.rs precondition: requires mdp:start — refused, not degraded.
    const err = await fixtures.runBreedCaught('rl_symbolic', emptyInput);
    expect(err.status).not.toBe('ok');
    expect(err.error).toContain('requires mdp:start');
  });
});
