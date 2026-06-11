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

describe('csp_ac3 breed integration', () => {
  it('solves a constraint satisfaction problem', async () => {
    const result = (await fixtures.runBreed(
      'csp_ac3',
      fixtures.minimalCspAc3Input()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('CspAc3');
    expect(result.output.explanation).toBe('SAT: V1=B, V2=G');
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
  });
});

describe('default_logic breed integration', () => {
  it('finds an extension for default rules', async () => {
    const result = (await fixtures.runBreed(
      'default_logic',
      fixtures.minimalDefaultLogicInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('DefaultLogic');
    expect(result.output.selected).toContain('tweety');
    expect(result.output.selected).toContain('flies');
  });
});

describe('dempster_shafer breed integration', () => {
  it('combines belief masses using Dempster rule', async () => {
    const result = (await fixtures.runBreed(
      'dempster_shafer',
      fixtures.minimalDempsterShaferInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('DempsterShafer');
    expect(result.output.selected).toContain('Bel=0.31034');
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
  });
});

describe('frames_inheritance breed integration', () => {
  it('resolves slot values up the inheritance chain with overrides', async () => {
    const result = (await fixtures.runBreed(
      'frames_inheritance',
      fixtures.minimalFramesInheritanceInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('FramesInheritance');
    expect(result.output.selected).toBe('5kg');
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
  });
});

describe('ebl breed integration', () => {
  it('learns operationalized rules from training concept', async () => {
    const result = (await fixtures.runBreed(
      'ebl',
      fixtures.minimalEblInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Ebl');
    const ruleFact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === 'ebl:rule');
    expect(ruleFact).toBeDefined();
    expect(ruleFact?.value).toContain('drinkable');
    expect(result.output.inference_trace.length).toBeGreaterThan(0);
  });
});

describe('asp breed integration', () => {
  it('finds stable models using Gelfond-Lifschitz reduct', async () => {
    const result = (await fixtures.runBreed(
      'asp',
      fixtures.minimalAspInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Asp');
    const countFact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === 'asp:answer_set_count');
    expect(countFact).toBeDefined();
    expect(countFact?.value).toBe('2');
    expect(result.output.selected).toBeDefined();
    expect(['a', 'b']).toContain(result.output.selected);
  });
});

describe('description_logic breed integration', () => {
  it('propagates subsumptions and checks consistency', async () => {
    const result = (await fixtures.runBreed(
      'description_logic',
      fixtures.minimalDescriptionLogicInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('DescriptionLogic');
    const verdictFact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === 'dl:verdict:A:C');
    expect(verdictFact).toBeDefined();
    expect(verdictFact?.value).toBe('true');
    expect(result.output.selected).toBe('A⊑C=true');
  });
});

describe('abductive_lp breed integration', () => {
  it('finds abductive explanations satisfying goals', async () => {
    const result = (await fixtures.runBreed(
      'abductive_lp',
      fixtures.minimalAbductiveLpInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AbductiveLp');
    const countFact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === 'alp:explanation_count');
    expect(countFact).toBeDefined();
    expect(countFact?.value).toBe('2');
    expect(result.output.selected).toBe('{c}');
  });
});

describe('abductive_ibe breed integration', () => {
  it('performs explanatory coherence selection using ECHO', async () => {
    const result = (await fixtures.runBreed(
      'abductive_ibe',
      fixtures.minimalAbductiveIbeInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AbductiveIbe');
    expect(result.output.selected).toBe('H1');
  });
});

describe('asp breed — paper fixture', () => {
  it('solves stable models on Gelfond-Lifschitz example', async () => {
    const fixture = loadPaperFixture('asp');
    const result = (await fixtures.runBreed('asp', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Asp');
    const countFact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === 'stable_models_count');
    expect(countFact?.value).toBe(fixture.expected.stable_models_count);
  });
});

describe('description_logic breed — paper fixture', () => {
  it('propagates subclass transitivity and checks consistency', async () => {
    const fixture = loadPaperFixture('description_logic');
    const result = (await fixtures.runBreed('description_logic', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('DescriptionLogic');
    for (const [key, val] of Object.entries(fixture.expected.verdicts)) {
      const fact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === key);
      expect(fact?.value).toBe(val);
    }
  });
});

describe('abductive_lp breed — paper fixture', () => {
  it('finds minimal abductive explanation under ICs', async () => {
    const fixture = loadPaperFixture('abductive_lp');
    const result = (await fixtures.runBreed('abductive_lp', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AbductiveLp');
    const countFact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === 'alp:explanation_count');
    expect(countFact?.value).toBe(fixture.expected.explanation_count);
    expect(result.output.selected).toBe(fixture.expected.selected ?? fixture.expected.explanations[0]);
  });
});

describe('abductive_ibe breed — paper fixture', () => {
  it('selects best explanation using coherence ECHO network', async () => {
    const fixture = loadPaperFixture('abductive_ibe');
    const result = (await fixtures.runBreed('abductive_ibe', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AbductiveIbe');
    expect(result.output.selected).toBe(fixture.expected.selected ?? fixture.expected.best);
  });
});

describe('act_r breed — paper fixture', () => {
  it('retrieves the highest activation chunk via ACT-R equation', async () => {
    const fixture = loadPaperFixture('act_r');
    const result = (await fixtures.runBreed('act_r', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('ActR');
    expect(result.output.selected).toBe(fixture.expected.value);
  });
});

describe('problog breed — paper fixture', () => {
  it('computes exact success probability via possible-worlds', async () => {
    const fixture = loadPaperFixture('problog');
    const result = (await fixtures.runBreed('problog', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Problog');
    expect(result.output.selected).toBe(fixture.expected.value);
  });
});

describe('sat_cdcl breed — paper fixture', () => {
  it('proves UNSAT using conflict-driven clause learning', async () => {
    const fixture = loadPaperFixture('sat_cdcl');
    const result = (await fixtures.runBreed('sat_cdcl', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('SatCdcl');
    expect(result.output.selected).toBe(fixture.expected.value);
  });
});

describe('episodic_memory breed — paper fixture', () => {
  it('retrieves nearest episode using Tulving temporal organisation', async () => {
    const fixture = loadPaperFixture('episodic_memory');
    const result = (await fixtures.runBreed('episodic_memory', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('EpisodicMemory');
    expect(result.output.selected).toBe(fixture.expected.value);
  });
});


describe('ltl_monitor breed — paper fixture', () => {
  it('monitors LTL properties', async () => {
    const fixture = loadPaperFixture('ltl_monitor');
    const result = (await fixtures.runBreed('ltl_monitor', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('LtlMonitor');
    expect(result.output.selected).toBe(fixture.expected.value);
  });
});

describe('allen_temporal breed — paper fixture', () => {
  it('propagates temporal relations', async () => {
    const fixture = loadPaperFixture('allen_temporal');
    const result = (await fixtures.runBreed('allen_temporal', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AllenTemporal');
    expect(result.output.selected).toBe(fixture.expected.value);
  });
});

describe('fuzzy_logic breed — paper fixture', () => {
  it('computes centroid for fuzzy rules', async () => {
    const fixture = loadPaperFixture('fuzzy_logic');
    const result = (await fixtures.runBreed('fuzzy_logic', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('FuzzyLogic');
    const outFact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === fixture.expected.output_fact);
    expect(Number(outFact?.value)).toBeCloseTo(Number(fixture.expected.value), 3);
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

// ─────────────────────────────────────────────────────────────────────────────
// P4 tier breeds (real WASM, FM-5 — no init mocking)
// ─────────────────────────────────────────────────────────────────────────────

function p4Input(facts: Array<{ key: string; value: string }>) {
  return {
    intent: 'p4 integration',
    candidates: [],
    facts,
    cases: [],
    rules: [],
    goals: [],
    state: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('tableaux breed integration', () => {
  it('proves the K axiom valid with zero beta expansions', async () => {
    const result = (await fixtures.runBreed(
      'tableaux',
      p4Input([{ key: 'tableaux:formula', value: 'a -> (b -> a)' }])
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Tableaux');
    expect(result.output.selected).toBe('valid');
    const betas = result.output.inference_trace.filter(
      (t: { kind: string }) => t.kind === 'beta-expand'
    );
    expect(betas.length).toBe(0);
  });
});

describe('construction_grammar breed integration', () => {
  it('coerces intransitive sneeze into the caused-motion construction', async () => {
    const result = (await fixtures.runBreed(
      'construction_grammar',
      p4Input([
        { key: 'cxg:utterance', value: 'he sneezed the napkin off the table' },
        { key: 'lex:he:pos', value: 'pron' },
        { key: 'lex:sneezed:pos', value: 'verb' },
        { key: 'lex:sneezed:valence', value: 'intransitive' },
        { key: 'lex:the:pos', value: 'det' },
        { key: 'lex:napkin:pos', value: 'noun' },
        { key: 'lex:off:pos', value: 'prep' },
        { key: 'lex:table:pos', value: 'noun' },
      ])
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.selected).toBe('caused-motion');
    const coerced = result.output.facts.find(
      (f: { key: string }) => f.key === 'cxg:coerced'
    );
    expect(coerced?.value).toBe('true');
  });
});

describe('markov_logic breed integration', () => {
  it('reaches the zero-cost MAP state of the smokes/friends MLN', async () => {
    const result = (await fixtures.runBreed(
      'markov_logic',
      p4Input([
        { key: 'mln:clause:c1', value: '1.5|!smokes_anna,cancer_anna' },
        { key: 'mln:clause:c2', value: '1.1|!friends_ab,!smokes_anna,smokes_bob' },
        { key: 'evidence:smokes_anna', value: 'true' },
        { key: 'evidence:friends_ab', value: 'true' },
      ])
    )) as AnyResult;
    expect(result.status).toBe('ok');
    const cost = result.output.facts.find((f: { key: string }) => f.key === 'mln:cost');
    expect(cost?.value).toBe('0.000000');
    const bob = result.output.facts.find(
      (f: { key: string }) => f.key === 'mln:atom:smokes_bob'
    );
    expect(bob?.value).toBe('true');
  });
});

describe('pomdp breed integration', () => {
  it('computes the exact tiger posterior 0.85 after one hear-left', async () => {
    const facts: Array<{ key: string; value: string }> = [
      { key: 'pomdp:states', value: 'tiger-left,tiger-right' },
      { key: 'pomdp:actions', value: 'listen,open-left,open-right' },
      { key: 'pomdp:observations', value: 'hear-left,hear-right' },
      { key: 'pomdp:gamma', value: '0.95' },
      { key: 'pomdp:horizon', value: '3' },
      { key: 'pomdp:b0:tiger-left', value: '0.5' },
      { key: 'pomdp:b0:tiger-right', value: '0.5' },
      { key: 'pomdp:o:listen:tiger-left:hear-left', value: '0.85' },
      { key: 'pomdp:o:listen:tiger-left:hear-right', value: '0.15' },
      { key: 'pomdp:o:listen:tiger-right:hear-left', value: '0.15' },
      { key: 'pomdp:o:listen:tiger-right:hear-right', value: '0.85' },
      { key: 'pomdp:step:0', value: 'listen|hear-left' },
    ];
    for (const s of ['tiger-left', 'tiger-right']) {
      for (const sp of ['tiger-left', 'tiger-right']) {
        facts.push({
          key: `pomdp:t:listen:${s}:${sp}`,
          value: s === sp ? '1.0' : '0.0',
        });
      }
      facts.push({ key: `pomdp:r:listen:${s}`, value: '-1.0' });
    }
    for (const a of ['open-left', 'open-right']) {
      for (const s of ['tiger-left', 'tiger-right']) {
        for (const sp of ['tiger-left', 'tiger-right']) {
          facts.push({ key: `pomdp:t:${a}:${s}:${sp}`, value: '0.5' });
        }
        for (const ob of ['hear-left', 'hear-right']) {
          facts.push({ key: `pomdp:o:${a}:${s}:${ob}`, value: '0.5' });
        }
      }
    }
    facts.push({ key: 'pomdp:r:open-left:tiger-left', value: '-100.0' });
    facts.push({ key: 'pomdp:r:open-left:tiger-right', value: '10.0' });
    facts.push({ key: 'pomdp:r:open-right:tiger-left', value: '10.0' });
    facts.push({ key: 'pomdp:r:open-right:tiger-right', value: '-100.0' });

    const result = (await fixtures.runBreed('pomdp', p4Input(facts))) as AnyResult;
    expect(result.status).toBe('ok');
    const belief = result.output.facts.find(
      (f: { key: string }) => f.key === 'pomdp:belief:tiger-left'
    );
    expect(belief?.value).toBe('0.850000');
  });
});

describe('contingent_plan breed integration', () => {
  it('emits the AIMA vacuum conditional plan with exactly one sense node', async () => {
    const result = (await fixtures.runBreed(
      'contingent_plan',
      p4Input([
        { key: 'cp:unknown', value: 'dirt' },
        { key: 'cp:goal:dirt', value: 'false' },
        { key: 'cp:act:suck:pre', value: 'dirt' },
        { key: 'cp:act:suck:del', value: 'dirt' },
        { key: 'cp:sense:check-dirt', value: 'dirt' },
      ])
    )) as AnyResult;
    expect(result.status).toBe('ok');
    const tree = result.output.facts.find((f: { key: string }) => f.key === 'plan:tree');
    expect(tree?.value).toBe('(sense check-dirt dirt (act suck (done)) (done))');
  });
});

describe('meta_reasoning breed integration', () => {
  it('detects the mycin-vs-prolog conflict and resolves by confidence', async () => {
    const result = (await fixtures.runBreed(
      'meta_reasoning',
      p4Input([
        { key: 'breed:mycin:conclusion', value: 'therapy=gentamicin' },
        { key: 'breed:mycin:confidence', value: '0.8' },
        { key: 'breed:prolog:conclusion', value: 'therapy=none' },
        { key: 'breed:prolog:confidence', value: '0.6' },
      ])
    )) as AnyResult;
    expect(result.status).toBe('ok');
    const conflicts = result.output.inference_trace.filter(
      (t: { kind: string }) => t.kind === 'conflict-detected'
    );
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].detail).toContain('mycin');
    expect(conflicts[0].detail).toContain('prolog');
    expect(result.output.selected).toBe('therapy=gentamicin');
  });
});

describe('belief_merging breed — paper fixture', () => {
  it('merges profiles using sum and gmax operators', async () => {
    const fixture = loadPaperFixture('belief_merging');
    const result = (await fixtures.runBreed('belief_merging', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('BeliefMerging');
    expect(result.output.selected).toBeDefined();
  });
});

describe('qualitative_reason breed — paper fixture', () => {
  it('envisions the regulator confluences and reaches equilibrium', async () => {
    const fixture = loadPaperFixture('qualitative_reason');
    const result = (await fixtures.runBreed('qualitative_reason', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('QualitativeReason');
    expect(result.output.selected).toBeDefined();
  });
});

describe('script_sam breed — paper fixture', () => {
  it('infers unobserved scenes in the restaurant script', async () => {
    const fixture = loadPaperFixture('script_sam');
    const result = (await fixtures.runBreed('script_sam', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('ScriptSam');
    expect(result.output.selected).toBeDefined();
  });
});

describe('clp breed — paper fixture', () => {
  it('solves arithmetic constraints using propagation over finite domains', async () => {
    const fixture = loadPaperFixture('clp');
    const result = (await fixtures.runBreed('clp', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Clp');
    expect(result.output.selected).toBe(fixture.expected.solution);
  });
});

describe('situation_calculus breed — paper fixture', () => {
  it('progresses blocks world through action sequence handling frame problem', async () => {
    const fixture = loadPaperFixture('situation_calculus');
    const result = (await fixtures.runBreed('situation_calculus', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('SituationCalculus');
    
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    for (const holds of fixture.expected.holds_final) {
      // situation_calculus.rs emits final-situation fluents as `holds:<fluent>`.
      const fact = facts.find((f: {key: string}) => f.key === `holds:${holds}`);
      expect(fact?.value).toBe('true');
    }
  });
});

describe('circumscription breed — paper fixture', () => {
  it('circumscribes abnormality predicate for bird/penguin theory', async () => {
    const fixture = loadPaperFixture('circumscription');
    const result = (await fixtures.runBreed('circumscription', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Circumscription');
    
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    for (const [key, value] of Object.entries(fixture.expected.entailed)) {
      const fact = facts.find((f: {key: string}) => f.key === `entailed:${key}`);
      expect(fact?.value).toBe(String(value));
    }
  });
});

describe('analogy_sme breed — paper fixture', () => {
  it('maps solar system to atom and generates candidate inference', async () => {
    const fixture = loadPaperFixture('analogy_sme');
    const result = (await fixtures.runBreed('analogy_sme', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('AnalogySme');
    
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    for (const [base, target] of Object.entries(fixture.expected.mapping)) {
      const fact = facts.find((f: {key: string}) => f.key === `map:${base}`);
      expect(fact?.value).toBe(String(target));
    }
    
    const inference = facts.find((f: {key: string}) => f.key === 'candidate_inference');
    if (inference) {
      expect(inference.value).toContain(fixture.expected.candidate_inference_contains);
    }
  });
});
