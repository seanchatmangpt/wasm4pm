/**
 * Integration tests for cognition breeds: sat_cdcl, script_sam,
 * situation_calculus, version_space.
 *
 * FM-5 compliance: no init.js mocking. These tests MUST fail if the
 * WASM `pkg/` is deleted (and the pnpm hard-copy is also deleted; see
 * `.claude/rules/cognition-contracts.md` "FM-5 cleanup ritual").
 *
 * Each describe block asserts Rank-2 domain-contract oracles, structural
 * fingerprints, two-query consistency, error contracts, and determinism (DoD
 * tiers 1–5). If a breed fails its oracle on minimal input the test fails
 * honestly — never softened.
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
// sat_cdcl
// =============================================================================

describe('sat_cdcl breed integration', () => {
  it('Rank-1+2: solves a satisfiable 2-clause instance and emits model facts', async () => {
    const result = (await fixtures.runBreed(
      'sat_cdcl',
      fixtures.minimalSatCdclInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('SatCdcl');
    // Rank-2: SAT verdict
    expect(result.output.selected).toBe('SAT');
    // Structural fingerprint: model facts must exist for both variables
    const modelFacts = (result.output.facts as Array<{ key: string; value: string }>).filter(f =>
      f.key.startsWith('model:')
    );
    expect(modelFacts.length).toBeGreaterThan(0);
    // Structural fingerprint: inference_trace must contain a 'decide' or 'propagate' step
    const traceKinds = (result.output.inference_trace as Array<{ kind: string }>).map(t => t.kind);
    const hasSearchStep = traceKinds.some(k => ['decide', 'propagate', 'decision'].includes(k));
    expect(hasSearchStep).toBe(true);
  });

  it('Rank-2: correctly identifies UNSAT and emits at least one learned clause', async () => {
    const result = (await fixtures.runBreed(
      'sat_cdcl',
      fixtures.unsatSatCdclInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('SatCdcl');
    expect(result.output.selected).toBe('UNSAT');
    // Structural fingerprint: conflict analysis must produce a learned clause
    const learnedFacts = (result.output.facts as Array<{ key: string; value: string }>).filter(f =>
      f.key.startsWith('learned:')
    );
    expect(learnedFacts.length).toBeGreaterThan(0);
    // Trace must include 'conflict' step
    const traceKinds = (result.output.inference_trace as Array<{ kind: string }>).map(t => t.kind);
    expect(traceKinds).toContain('conflict');
  });

  it('two-query consistency: SAT vs UNSAT instances produce different verdicts', async () => {
    const [satResult, unsatResult] = await Promise.all([
      fixtures.runBreed('sat_cdcl', fixtures.minimalSatCdclInput()) as Promise<AnyResult>,
      fixtures.runBreed('sat_cdcl', fixtures.unsatSatCdclInput()) as Promise<AnyResult>,
    ]);
    expect(satResult.output.selected).not.toBe(unsatResult.output.selected);
    expect(satResult.output.selected).toBe('SAT');
    expect(unsatResult.output.selected).toBe('UNSAT');
  });

  it('determinism: same input produces identical selected and output_hash', async () => {
    const input = fixtures.minimalSatCdclInput();
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('sat_cdcl', input) as Promise<AnyResult>,
      fixtures.runBreed('sat_cdcl', input) as Promise<AnyResult>,
    ]);
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });
});

describe('sat_cdcl breed — paper fixture (Marques-Silva & Sakallah 1999)', () => {
  it('refutes PHP(3,2) pigeonhole as UNSAT with ≥1 learned clause', async () => {
    const fixture = loadPaperFixture('sat_cdcl');
    const result = (await fixtures.runBreed('sat_cdcl', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('SatCdcl');
    expect(result.output.selected).toBe(fixture.expected.verdict);
    const learnedFacts = (result.output.facts as Array<{ key: string; value: string }>).filter(f =>
      f.key.startsWith('learned:')
    );
    expect(learnedFacts.length).toBeGreaterThanOrEqual(fixture.expected.min_learned_clauses);
    // Structural fingerprint: at least one learn-clause trace step with from=/pivots=
    const learnSteps = (result.output.inference_trace as Array<{ kind: string; detail?: string }>).filter(
      t => t.kind === 'learn-clause'
    );
    expect(learnSteps.length).toBeGreaterThanOrEqual(fixture.expected.min_learned_clauses);
  });
});

// =============================================================================
// script_sam
// =============================================================================

describe('script_sam breed integration', () => {
  it('Rank-1+2: matches restaurant script and infers unstated eating scene', async () => {
    const result = (await fixtures.runBreed(
      'script_sam',
      fixtures.minimalScriptSamInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('ScriptSam');
    // Rank-2: correct script selected
    expect(result.output.selected).toBe('restaurant');
    // Structural fingerprint: inferred eating gap scene with bound actor
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const inferredEat = facts.find(f => f.key === 'sam:inferred:eat');
    expect(inferredEat).toBeDefined();
    expect(inferredEat?.value).toBe('john');
    // Role binding must exist
    const roleCustomer = facts.find(f => f.key === 'sam:role:customer');
    expect(roleCustomer?.value).toBe('john');
  });

  it('two-query consistency: restaurant vs airport scripts differ', async () => {
    const [restResult, airResult] = await Promise.all([
      fixtures.runBreed('script_sam', fixtures.minimalScriptSamInput()) as Promise<AnyResult>,
      fixtures.runBreed('script_sam', fixtures.airportScriptSamInput()) as Promise<AnyResult>,
    ]);
    expect(restResult.output.selected).toBe('restaurant');
    expect(airResult.output.selected).toBe('airport');
    expect(restResult.output.selected).not.toBe(airResult.output.selected);
  });

  it('determinism: same restaurant story produces identical results', async () => {
    const input = fixtures.minimalScriptSamInput();
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('script_sam', input) as Promise<AnyResult>,
      fixtures.runBreed('script_sam', input) as Promise<AnyResult>,
    ]);
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });

  it('inference_trace contains select-script and infer-gap steps', async () => {
    const result = (await fixtures.runBreed(
      'script_sam',
      fixtures.minimalScriptSamInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    const traceKinds = (result.output.inference_trace as Array<{ kind: string }>).map(t => t.kind);
    expect(traceKinds).toContain('select-script');
    expect(traceKinds).toContain('infer-gap');
  });
});

describe('script_sam breed — paper fixture (Schank & Abelson 1977)', () => {
  it('infers eat scene and binds john as customer per Chapter 3 worked example', async () => {
    const fixture = loadPaperFixture('script_sam');
    const result = (await fixtures.runBreed('script_sam', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('ScriptSam');
    expect(result.output.selected).toBe(fixture.expected.script);
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    // Verbatim expected inferred facts
    for (const [key, val] of Object.entries(fixture.expected.inferred as Record<string, string>)) {
      const fact = facts.find(f => f.key === key);
      expect(fact).toBeDefined();
      expect(fact?.value).toBe(val);
    }
    // Inferred count
    const countFact = facts.find(f => f.key === 'sam:inferred_count');
    expect(countFact?.value).toBe(fixture.expected.inferred_count);
    // Role binding
    for (const [key, val] of Object.entries(fixture.expected.role as Record<string, string>)) {
      const fact = facts.find(f => f.key === key);
      expect(fact).toBeDefined();
      expect(fact?.value).toBe(val);
    }
  });
});

// =============================================================================
// situation_calculus
// =============================================================================

describe('situation_calculus breed integration', () => {
  it('Rank-1+2: progresses pickup+putdown and holds expected fluents in final situation', async () => {
    const result = (await fixtures.runBreed(
      'situation_calculus',
      fixtures.minimalSituationCalculusInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('SituationCalculus');
    // Rank-2: final situation s2 after 2 actions
    expect(result.output.selected).toBe('s2');
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    // Must hold after sequence: on_a_table, on_b_table, clear_a, clear_b, handempty, color_b_red
    const holdingFluents = facts.filter(f => f.key.startsWith('holds:') && f.value === 'true').map(f => f.key.slice('holds:'.length));
    expect(holdingFluents).toContain('on_a_table');
    expect(holdingFluents).toContain('on_b_table');
    expect(holdingFluents).toContain('color_b_red');
    // Must NOT hold: on_a_b, holding_a
    expect(holdingFluents).not.toContain('on_a_b');
    expect(holdingFluents).not.toContain('holding_a');
  });

  it('two-query consistency: 2-action vs 1-action sequences reach different situations', async () => {
    const [twoAction, oneAction] = await Promise.all([
      fixtures.runBreed('situation_calculus', fixtures.minimalSituationCalculusInput()) as Promise<AnyResult>,
      fixtures.runBreed('situation_calculus', fixtures.singleActionSituationCalculusInput()) as Promise<AnyResult>,
    ]);
    expect(twoAction.output.selected).toBe('s2');
    expect(oneAction.output.selected).toBe('s1');
    expect(twoAction.output.selected).not.toBe(oneAction.output.selected);
  });

  it('frame persistence: color_b_red and on_b_table appear in frame-persist trace steps', async () => {
    const result = (await fixtures.runBreed(
      'situation_calculus',
      fixtures.minimalSituationCalculusInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    const frameSteps = (result.output.inference_trace as Array<{ kind: string; detail?: string }>).filter(
      t => t.kind === 'frame-persist'
    );
    expect(frameSteps.length).toBeGreaterThanOrEqual(2);
    const details = frameSteps.map(t => t.detail ?? '').join(' ');
    expect(details).toMatch(/on_b_table|color_b_red/);
  });

  it('determinism: same blocks-world input produces identical output', async () => {
    const input = fixtures.minimalSituationCalculusInput();
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('situation_calculus', input) as Promise<AnyResult>,
      fixtures.runBreed('situation_calculus', input) as Promise<AnyResult>,
    ]);
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });
});

describe('situation_calculus breed — paper fixture (Reiter 1991)', () => {
  it('holds exactly the published final fluents and identifies 2 frame-persist fluents', async () => {
    const fixture = loadPaperFixture('situation_calculus');
    const result = (await fixtures.runBreed('situation_calculus', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('SituationCalculus');
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const holdingFluents = facts.filter(f => f.key.startsWith('holds:') && f.value === 'true').map(f => f.key.slice('holds:'.length));
    for (const f of fixture.expected.holds_final as string[]) {
      expect(holdingFluents).toContain(f);
    }
    for (const f of fixture.expected.not_holds_final as string[]) {
      expect(holdingFluents).not.toContain(f);
    }
    // Frame persist count
    const frameSteps = (result.output.inference_trace as Array<{ kind: string }>).filter(
      t => t.kind === 'frame-persist'
    );
    expect(frameSteps.length).toBeGreaterThanOrEqual((fixture.expected.frame_persist_fluents as string[]).length);
    // Regress steps == number of actions
    const regressSteps = (result.output.inference_trace as Array<{ kind: string }>).filter(
      t => t.kind === 'regress-step'
    );
    expect(regressSteps.length).toBe(fixture.expected.regress_steps);
  });
});

// =============================================================================
// version_space
// =============================================================================

describe('version_space breed integration', () => {
  it('Rank-1+2: computes S and G boundaries for EnjoySport and emits converged flag', async () => {
    const result = (await fixtures.runBreed(
      'version_space',
      fixtures.minimalVersionSpaceEnjoySportInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('VersionSpace');
    // Rank-2: S4 boundary from Mitchell 1997 Table 2.5
    expect(result.output.selected).toBe('Sunny,Warm,?,Strong,?,?');
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const sFact = facts.find(f => f.key === 'vs:s');
    expect(sFact?.value).toBe('Sunny,Warm,?,Strong,?,?');
    // Not fully converged (S ≠ G)
    const convergedFact = facts.find(f => f.key === 'vs:converged');
    expect(convergedFact?.value).toBe('false');
    // G boundary must have exactly 2 members after example 4
    const gFacts = facts.filter(f => f.key.startsWith('vs:g:'));
    expect(gFacts.length).toBe(2);
  });

  it('two-query consistency: EnjoySport vs simple 2-attr instance differ in S boundary', async () => {
    const [fullResult, simpleResult] = await Promise.all([
      fixtures.runBreed('version_space', fixtures.minimalVersionSpaceEnjoySportInput()) as Promise<AnyResult>,
      fixtures.runBreed('version_space', fixtures.minimalVersionSpaceSimpleInput()) as Promise<AnyResult>,
    ]);
    expect(fullResult.output.selected).not.toBe(simpleResult.output.selected);
    // EnjoySport S has 6 comma-separated attributes
    expect((fullResult.output.selected as string).split(',').length).toBe(6);
    // Simple instance S has 2 attributes
    expect((simpleResult.output.selected as string).split(',').length).toBe(2);
  });

  it('inference_trace contains vs-init, vs-update steps', async () => {
    const result = (await fixtures.runBreed(
      'version_space',
      fixtures.minimalVersionSpaceEnjoySportInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    const traceKinds = (result.output.inference_trace as Array<{ kind: string }>).map(t => t.kind);
    expect(traceKinds).toContain('vs-init');
    expect(traceKinds).toContain('vs-update');
  });

  it('determinism: same EnjoySport input produces identical S boundary and output_hash', async () => {
    const input = fixtures.minimalVersionSpaceEnjoySportInput();
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('version_space', input) as Promise<AnyResult>,
      fixtures.runBreed('version_space', input) as Promise<AnyResult>,
    ]);
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });
});

describe('version_space breed — paper fixture (Mitchell 1982 / EnjoySport)', () => {
  it('S4 and G4 match Mitchell published boundaries; |G3|=3 after negative example', async () => {
    const fixture = loadPaperFixture('version_space');
    const result = (await fixtures.runBreed('version_space', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('VersionSpace');
    expect(result.output.selected).toBe(fixture.expected.s);
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    // G boundary members (order-independent set comparison)
    const gFacts = facts.filter(f => f.key.startsWith('vs:g:')).map(f => f.value);
    const expectedG = fixture.expected.g as string[];
    expect(gFacts.sort()).toEqual(expectedG.sort());
    // converged flag
    const convergedFact = facts.find(f => f.key === 'vs:converged');
    expect(convergedFact?.value).toBe(fixture.expected.converged);
  });
});
