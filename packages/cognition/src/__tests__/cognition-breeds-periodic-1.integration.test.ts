/**
 * Integration tests for 7 cognition breeds (periodic batch 1):
 *   act_r · allen_temporal · analogy_sme · bayesian_network ·
 *   belief_merging · circumscription · clp
 *
 * FM-5 compliance: NO init.js mocking allowed. These tests MUST fail if the
 * WASM `pkg/` is deleted (and the pnpm hard-copy is also deleted; see
 * `.claude/rules/cognition-contracts.md` "FM-5 cleanup ritual").
 *
 * Each describe block covers four DoD tiers:
 *   Rank-1 : status === 'ok' AND output.breed === '<PascalCase>'
 *   Rank-2 : structural fingerprint / published paper oracle
 *   Rank-3 : two-query consistency (proves the engine actually computes)
 *   Rank-4 : error-contract + determinism assertions
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fixtures from './fixtures/breed-inputs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAPERS_DIR = path.join(__dirname, 'fixtures', 'papers');

function loadPaperFixture(breed: string): any {
  const p = path.join(PAPERS_DIR, `${breed}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;

// =============================================================================
// ACT-R
// =============================================================================

describe('act_r breed integration', () => {
  it('Rank-1: status ok and breed name is ActR', async () => {
    const result = (await fixtures.runBreed('act_r', fixtures.minimalActRInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('ActR');
  });

  it('Rank-2: retrieves fact34 (sum=7) — paper fixture Anderson & Lebiere 1998', async () => {
    const fixture = loadPaperFixture('act_r');
    const result = (await fixtures.runBreed('act_r', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    // selected must be the highest-activation chunk id.
    expect(result.output.selected).toBe(fixture.expected.retrieved);
    // sum=7 must appear in working-memory facts.
    const sumFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === fixture.expected.sum_fact.key && f.value === fixture.expected.sum_fact.value
    );
    expect(sumFact).toBeDefined();
  });

  it('Rank-3: two-query consistency — different addends retrieve different chunks', async () => {
    const r1 = (await fixtures.runBreed('act_r', fixtures.minimalActRInput())) as AnyResult;
    const r2 = (await fixtures.runBreed('act_r', fixtures.altActRInput())) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    // fact34 vs fact22 — selected must differ.
    expect(r1.output.selected).not.toBe(r2.output.selected);
  });

  it('Rank-4: determinism — same input yields identical selected', async () => {
    const input = fixtures.minimalActRInput();
    const a = (await fixtures.runBreed('act_r', input)) as AnyResult;
    const b = (await fixtures.runBreed('act_r', input)) as AnyResult;
    expect(a.output.selected).toBe(b.output.selected);
  });
});

// =============================================================================
// ALLEN TEMPORAL
// =============================================================================

describe('allen_temporal breed integration', () => {
  it('Rank-1: status ok and breed name is AllenTemporal', async () => {
    const result = (await fixtures.runBreed(
      'allen_temporal',
      fixtures.minimalAllenTemporalInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AllenTemporal');
  });

  it('Rank-2: paper fixture — A meets B, B during C → derived A,C is o|d|s', async () => {
    const fixture = loadPaperFixture('allen_temporal');
    const result = (await fixtures.runBreed('allen_temporal', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    const acFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'derived:A,C'
    );
    expect(acFact).toBeDefined();
    expect(acFact?.value).toBe(fixture.expected.derived['derived:A,C']);
    const caFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'derived:C,A'
    );
    expect(caFact).toBeDefined();
    expect(caFact?.value).toBe(fixture.expected.derived['derived:C,A']);
  });

  it('Rank-3: two-query consistency — different relation pairs yield different derived facts', async () => {
    const r1 = (await fixtures.runBreed(
      'allen_temporal',
      fixtures.minimalAllenTemporalInput()
    )) as AnyResult;
    const r2 = (await fixtures.runBreed(
      'allen_temporal',
      fixtures.altAllenTemporalInput()
    )) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    // Different inputs → different derived relations. Both networks use the same
    // intervals {A,B,C}, so the derived-fact KEYS coincide; the relation VALUES
    // must differ (m;d vs p;d compositions per Allen 1983 Table 1).
    const kv1 = (r1.output.facts as Array<{ key: string; value: string }>)
      .map((f) => `${f.key}=${f.value}`).sort().join(',');
    const kv2 = (r2.output.facts as Array<{ key: string; value: string }>)
      .map((f) => `${f.key}=${f.value}`).sort().join(',');
    expect(kv1).not.toBe(kv2);
  });

  it('Rank-4: determinism — repeated run on same input yields same selected', async () => {
    const input = fixtures.minimalAllenTemporalInput();
    const a = (await fixtures.runBreed('allen_temporal', input)) as AnyResult;
    const b = (await fixtures.runBreed('allen_temporal', input)) as AnyResult;
    expect(a.output.selected).toBe(b.output.selected);
  });
});

// =============================================================================
// ANALOGY SME
// =============================================================================

describe('analogy_sme breed integration', () => {
  it('Rank-1: status ok and breed name is AnalogySme', async () => {
    const result = (await fixtures.runBreed(
      'analogy_sme',
      fixtures.minimalAnalogySmeInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AnalogySme');
  });

  it('Rank-2: paper fixture — sun→nucleus, planet→electron; cause is candidate inference', async () => {
    const fixture = loadPaperFixture('analogy_sme');
    const result = (await fixtures.runBreed('analogy_sme', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    // Entity correspondences.
    const sunMap = facts.find((f) => f.key === 'map:sun');
    expect(sunMap?.value).toBe(fixture.expected.mapping.sun);
    const planetMap = facts.find((f) => f.key === 'map:planet');
    expect(planetMap?.value).toBe(fixture.expected.mapping.planet);
    // Candidate inference must contain the cause expression.
    const inferences = facts.filter((f) => f.key.startsWith('inference:'));
    expect(inferences.length).toBeGreaterThan(0);
    const hasCause = inferences.some((f) =>
      f.value.includes(fixture.expected.candidate_inference_contains)
    );
    expect(hasCause).toBe(true);
  });

  it('Rank-3: two-query consistency — solar vs trivial analogy yield different mappings', async () => {
    const r1 = (await fixtures.runBreed(
      'analogy_sme',
      fixtures.minimalAnalogySmeInput()
    )) as AnyResult;
    const r2 = (await fixtures.runBreed(
      'analogy_sme',
      fixtures.altAnalogySmeInput()
    )) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    // Different analogies must map different entity sets: the solar input maps
    // {sun, planet}; the water-flow input maps the three entities of the flow
    // relation (battery/bulb/current → pump/nozzle/water).
    const mapKeys1 = (r1.output.facts as Array<{ key: string }>)
      .filter((f) => f.key.startsWith('map:'))
      .map((f) => f.key)
      .sort();
    const mapKeys2 = (r2.output.facts as Array<{ key: string }>)
      .filter((f) => f.key.startsWith('map:'))
      .map((f) => f.key)
      .sort();
    expect(mapKeys1.length).toBeGreaterThan(0);
    expect(mapKeys2.length).toBeGreaterThan(0);
    expect(mapKeys1.join(',')).not.toBe(mapKeys2.join(','));
  });

  it('Rank-4: determinism — same input yields identical selected (systematicity score)', async () => {
    const input = fixtures.minimalAnalogySmeInput();
    const a = (await fixtures.runBreed('analogy_sme', input)) as AnyResult;
    const b = (await fixtures.runBreed('analogy_sme', input)) as AnyResult;
    expect(a.output.selected).toBe(b.output.selected);
  });
});

// =============================================================================
// BAYESIAN NETWORK
// =============================================================================

describe('bayesian_network breed integration', () => {
  it('Rank-1: status ok and breed name is BayesianNetwork', async () => {
    const result = (await fixtures.runBreed(
      'bayesian_network',
      fixtures.minimalBayesianNetworkInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('BayesianNetwork');
  });

  it('Rank-2: paper fixture — Pearl P(Burglary|J=t,M=t) = 0.2842 (±1e-4)', async () => {
    const fixture = loadPaperFixture('bayesian_network');
    const result = (await fixtures.runBreed('bayesian_network', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    // selected encodes "prob:B=0.NNNNN"
    const selected = result.output.selected as string;
    expect(selected).toMatch(/^prob:B=/);
    const numStr = selected.replace('prob:B=', '');
    const posterior = parseFloat(numStr);
    expect(Math.abs(posterior - fixture.expected.posterior)).toBeLessThan(1e-4);
  });

  it('Rank-3: two-query consistency — J+M evidence yields higher posterior than J alone', async () => {
    const r1 = (await fixtures.runBreed(
      'bayesian_network',
      fixtures.minimalBayesianNetworkInput()
    )) as AnyResult;
    const r2 = (await fixtures.runBreed(
      'bayesian_network',
      fixtures.altBayesianNetworkInput()
    )) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    const p1 = parseFloat((r1.output.selected as string).replace('prob:B=', ''));
    const p2 = parseFloat((r2.output.selected as string).replace('prob:B=', ''));
    expect(p1).toBeGreaterThan(p2);
  });

  it('Rank-4: determinism — repeated run yields identical posterior string', async () => {
    const input = fixtures.minimalBayesianNetworkInput();
    const a = (await fixtures.runBreed('bayesian_network', input)) as AnyResult;
    const b = (await fixtures.runBreed('bayesian_network', input)) as AnyResult;
    expect(a.output.selected).toBe(b.output.selected);
  });
});

// =============================================================================
// BELIEF MERGING
// =============================================================================

describe('belief_merging breed integration', () => {
  it('Rank-1: status ok and breed name is BeliefMerging', async () => {
    const result = (await fixtures.runBreed(
      'belief_merging',
      fixtures.minimalBeliefMergingInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('BeliefMerging');
  });

  it('Rank-2: paper fixture — sum operator selects majority world p,q', async () => {
    const fixture = loadPaperFixture('belief_merging');
    const result = (await fixtures.runBreed('belief_merging', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const modelCount = facts.find((f) => f.key === 'bm:model_count');
    expect(modelCount?.value).toBe(String(fixture.expected.sum_models.length));
    // The first (and only) model must be p,q.
    const model0 = facts.find((f) => f.key === 'bm:model:0');
    expect(model0?.value).toBe(fixture.expected.sum_models[0]);
  });

  it('Rank-3: two-query consistency — sum vs gmax select different model sets', async () => {
    const fixture = loadPaperFixture('belief_merging');
    const r1 = (await fixtures.runBreed('belief_merging', fixture.input)) as AnyResult;
    const r2 = (await fixtures.runBreed('belief_merging', fixture.input_gmax)) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    // sum → 1 model, gmax → 2 models.
    const count1 = (r1.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'bm:model_count'
    );
    const count2 = (r2.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'bm:model_count'
    );
    expect(count1?.value).not.toBe(count2?.value);
  });

  it('Rank-4: determinism — same input yields identical selected', async () => {
    const input = fixtures.minimalBeliefMergingInput();
    const a = (await fixtures.runBreed('belief_merging', input)) as AnyResult;
    const b = (await fixtures.runBreed('belief_merging', input)) as AnyResult;
    expect(a.output.selected).toBe(b.output.selected);
  });
});

// =============================================================================
// CIRCUMSCRIPTION
// =============================================================================

describe('circumscription breed integration', () => {
  it('Rank-1: status ok and breed name is Circumscription', async () => {
    const result = (await fixtures.runBreed(
      'circumscription',
      fixtures.minimalCircumscriptionInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Circumscription');
  });

  it('Rank-2: paper fixture — McCarthy 1980: tweety flies, opus does not', async () => {
    const fixture = loadPaperFixture('circumscription');
    const result = (await fixtures.runBreed('circumscription', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const tweetyFact = facts.find((f) => f.key === 'entailed:flies_tweety');
    expect(tweetyFact?.value).toBe(String(fixture.expected.entailed.flies_tweety));
    const opusFact = facts.find((f) => f.key === 'entailed:flies_opus');
    expect(opusFact?.value).toBe(String(fixture.expected.entailed.flies_opus));
    // circumscription.rs emits only entailed:<atom> facts (no ab: facts); the
    // minimal-ab-set effect is observable via selected = first entailed goal
    // (flies_tweety, since flies_opus is blocked by ab_bird_opus minimization).
    expect(result.output.selected).toBe('flies_tweety');
  });

  it('Rank-3: two-query consistency — penguin present vs absent changes opus entailment', async () => {
    const r1 = (await fixtures.runBreed(
      'circumscription',
      fixtures.minimalCircumscriptionInput()
    )) as AnyResult;
    const r2 = (await fixtures.runBreed(
      'circumscription',
      fixtures.altCircumscriptionInput()
    )) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    // r1 has flies_tweety=true AND flies_opus=false; r2 only has flies_tweety=true.
    const r1OpusFact = (r1.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'entailed:flies_opus'
    );
    expect(r1OpusFact?.value).toBe('false');
    const r2OpusFact = (r2.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'entailed:flies_opus'
    );
    // r2 has no opus goal at all — fact absent.
    expect(r2OpusFact).toBeUndefined();
  });

  it('Rank-4: determinism — same input produces identical selected', async () => {
    const input = fixtures.minimalCircumscriptionInput();
    const a = (await fixtures.runBreed('circumscription', input)) as AnyResult;
    const b = (await fixtures.runBreed('circumscription', input)) as AnyResult;
    expect(a.output.selected).toBe(b.output.selected);
  });
});

// =============================================================================
// CLP
// =============================================================================

describe('clp breed integration', () => {
  it('Rank-1: status ok and breed name is Clp', async () => {
    const result = (await fixtures.runBreed('clp', fixtures.minimalClpInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Clp');
  });

  it('Rank-2: paper fixture — Jaffar & Lassez 1987: x=6,y=3 with zero backtracks', async () => {
    const fixture = loadPaperFixture('clp');
    const result = (await fixtures.runBreed('clp', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.selected).toBe(fixture.expected.solution);
    const backtracks = (result.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'clp:backtracks'
    );
    expect(backtracks?.value).toBe(fixture.expected.backtracks);
  });

  it('Rank-3: two-query consistency — different domains yield different solutions', async () => {
    const r1 = (await fixtures.runBreed('clp', fixtures.minimalClpInput())) as AnyResult;
    const r2 = (await fixtures.runBreed('clp', fixtures.altClpInput())) as AnyResult;
    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    expect(r1.output.selected).not.toBe(r2.output.selected);
  });

  it('Rank-4: determinism — same input produces identical selected', async () => {
    const input = fixtures.minimalClpInput();
    const a = (await fixtures.runBreed('clp', input)) as AnyResult;
    const b = (await fixtures.runBreed('clp', input)) as AnyResult;
    expect(a.output.selected).toBe(b.output.selected);
  });
});
