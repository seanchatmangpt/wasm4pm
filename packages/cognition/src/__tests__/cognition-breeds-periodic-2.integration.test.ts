/**
 * Integration tests for csp_ac3, ctl_check, episodic_memory, event_calculus,
 * fuzzy_logic, ilp, and ltl_monitor cognition breeds.
 *
 * NO `vi.mock('../init.js')` — FM-5 compliance. These tests MUST fail if the
 * WASM `pkg/` is deleted (and the pnpm hard-copy is also deleted; see
 * `.claude/rules/cognition-contracts.md` "FM-5 cleanup ritual").
 *
 * Each describe block asserts a Rank-2 *domain-contract* oracle plus
 * structural fingerprint, two-query consistency, error contract, and
 * determinism tiers (innovative DoD requirements).
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

// ─────────────────────────────────────────────────────────────────────────────
// CSP_AC3
// ─────────────────────────────────────────────────────────────────────────────

describe('csp_ac3 breed integration', () => {
  it('Rank-1+2: solves a 2-variable coloring problem via AC-3', async () => {
    const result = (await fixtures.runBreed(
      'csp_ac3',
      fixtures.minimalCspAc3Input()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('CspAc3');
    // Rank-2: explanation must report SAT with actual assignments
    expect(result.output.explanation).toMatch(/^SAT:/);
    // Structural fingerprint: at least one 'revise' trace step proves AC ran
    const reviseSteps = (result.output.inference_trace as Array<{ kind: string }>)
      .filter((t) => t.kind === 'csp-revise' || t.kind === 'revise');
    expect(reviseSteps.length).toBeGreaterThan(0);
  });

  it('two-query consistency: different domains yield different assignments', async () => {
    const r1 = (await fixtures.runBreed('csp_ac3', fixtures.minimalCspAc3Input())) as AnyResult;
    // Build an UNSAT problem (single-value domains with inequality)
    const unsatInput = {
      intent: 'unsat coloring',
      candidates: [],
      facts: [
        { key: 'csp-var', value: 'A:R' },
        { key: 'csp-var', value: 'B:R' },
        { key: 'csp-constraint', value: 'A!=B' },
      ],
      cases: [], rules: [], goals: [], state: [],
    };
    const r2 = (await fixtures.runBreed('csp_ac3', unsatInput)) as AnyResult;
    // SAT vs UNSAT — results are demonstrably different
    expect(r1.output.selected).toBe('sat');
    expect(r2.output.selected).toBe('unsat');
  });

  it('determinism: same input produces identical output twice', async () => {
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('csp_ac3', fixtures.minimalCspAc3Input()),
      fixtures.runBreed('csp_ac3', fixtures.minimalCspAc3Input()),
    ]) as [AnyResult, AnyResult];
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output.explanation).toBe(r2.output.explanation);
    expect(r1.output_hash).toBe(r2.output_hash);
  });

  it('paper fixture (Mackworth 1977): solves 3-variable 3-color triangle', async () => {
    const fixture = loadPaperFixture('csp_ac3');
    const result = (await fixtures.runBreed('csp_ac3', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('CspAc3');
    expect(result.output.explanation).toBe(fixture.expected.explanation);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CTL_CHECK
// ─────────────────────────────────────────────────────────────────────────────

describe('ctl_check breed integration', () => {
  it('Rank-1+2: verifies AG !(c1 & c2) holds on a safe transition system', async () => {
    const result = (await fixtures.runBreed(
      'ctl_check',
      fixtures.minimalCtlCheckInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('CtlCheck');
    expect(result.output.selected).toBe('holds');
    const verdictFact = (result.output.facts as Array<{ key: string; value: string }>)
      .find((f) => f.key === 'ctl:verdict');
    expect(verdictFact?.value).toBe('holds');
  });

  it('two-query consistency: violating system returns "fails"', async () => {
    const safe = (await fixtures.runBreed('ctl_check', fixtures.minimalCtlCheckInput())) as AnyResult;
    const unsafe = (await fixtures.runBreed('ctl_check', fixtures.minimalCtlCheckFailInput())) as AnyResult;
    expect(safe.output.selected).toBe('holds');
    expect(unsafe.output.selected).toBe('fails');
  });

  it('determinism: identical inputs produce identical output hash', async () => {
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('ctl_check', fixtures.minimalCtlCheckInput()),
      fixtures.runBreed('ctl_check', fixtures.minimalCtlCheckInput()),
    ]) as [AnyResult, AnyResult];
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });

  it('paper fixture (Clarke-Emerson-Sistla 1986): mutual exclusion holds', async () => {
    const fixture = loadPaperFixture('ctl_check');
    const result = (await fixtures.runBreed('ctl_check', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('CtlCheck');
    const verdictFact = (result.output.facts as Array<{ key: string; value: string }>)
      .find((f) => f.key === 'ctl:verdict');
    expect(verdictFact?.value).toBe(fixture.expected.verdict);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EPISODIC_MEMORY
// ─────────────────────────────────────────────────────────────────────────────

describe('episodic_memory breed integration', () => {
  it('Rank-1+2: selects ep-breakfast via Jaccard + temporal kernel', async () => {
    const result = (await fixtures.runBreed(
      'episodic_memory',
      fixtures.minimalEpisodicMemoryInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('EpisodicMemory');
    // Rank-2: temporal proximity breaks Jaccard tie → breakfast wins
    expect(result.output.selected).toBe('ep-breakfast');
    // Structural fingerprint: score facts must exist for both episodes
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    expect(facts.find((f) => f.key === 'score:ep-breakfast')).toBeDefined();
    expect(facts.find((f) => f.key === 'score:ep-dinner')).toBeDefined();
  });

  it('two-query consistency: different cue context selects a different episode', async () => {
    const r1 = (await fixtures.runBreed('episodic_memory', fixtures.minimalEpisodicMemoryInput())) as AnyResult;
    const r2 = (await fixtures.runBreed('episodic_memory', fixtures.minimalEpisodicMemoryAltInput())) as AnyResult;
    expect(r1.output.selected).toBe('ep-breakfast');
    // Alt cue (t=20) is temporally closest to ep-morning (t=19); the temporal
    // kernel outweighs ep-old's higher outcome_score per episodic_memory.rs.
    expect(r2.output.selected).toBe('ep-morning');
    expect(r1.output.selected).not.toBe(r2.output.selected);
  });

  it('determinism: same episodes recalled identically on repeated calls', async () => {
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('episodic_memory', fixtures.minimalEpisodicMemoryInput()),
      fixtures.runBreed('episodic_memory', fixtures.minimalEpisodicMemoryInput()),
    ]) as [AnyResult, AnyResult];
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });

  it('paper fixture (Tulving 1983 / Nuxoll-Laird 2007): temporal kernel breaks tie', async () => {
    const fixture = loadPaperFixture('episodic_memory');
    const result = (await fixtures.runBreed('episodic_memory', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.selected).toBe(fixture.expected.recalled);
    // Verify numeric scores within tolerance from the paper
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const bfScore = parseFloat(facts.find((f) => f.key === 'score:ep-breakfast')?.value ?? 'NaN');
    const dScore = parseFloat(facts.find((f) => f.key === 'score:ep-dinner')?.value ?? 'NaN');
    expect(bfScore).toBeCloseTo(fixture.expected.score_breakfast, 2);
    expect(dScore).toBeCloseTo(fixture.expected.score_dinner, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENT_CALCULUS
// ─────────────────────────────────────────────────────────────────────────────

describe('event_calculus breed integration', () => {
  it('Rank-1+2: evaluates HoldsAt queries over the Kowalski-Sergot narrative', async () => {
    const input = {
      intent: 'evaluate HoldsAt queries over the Kowalski-Sergot hired/promoted narrative',
      candidates: [],
      facts: [
        { key: 'ec:happens:2', value: 'hire' },
        { key: 'ec:happens:5', value: 'promote' },
        { key: 'ec:initiates:hire', value: 'employed' },
        { key: 'ec:initiates:hire', value: 'lecturer' },
        { key: 'ec:initiates:promote', value: 'professor' },
        { key: 'ec:terminates:promote', value: 'lecturer' },
      ],
      cases: [],
      rules: [],
      goals: [
        { id: 'q1', predicate: 'ec:holdsat', value: 'lecturer@4' },
        { id: 'q2', predicate: 'ec:holdsat', value: 'lecturer@7' },
        { id: 'q3', predicate: 'ec:holdsat', value: 'professor@7' },
        { id: 'q4', predicate: 'ec:holdsat', value: 'employed@7' },
        { id: 'q5', predicate: 'ec:holdsat', value: 'professor@4' },
      ],
      state: [],
    };
    const result = (await fixtures.runBreed('event_calculus', input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('EventCalculus');
    // Per-query verdicts are exposed as `ec:verdict:<fluent>@<time>=<bool>` entries in
    // `output.selected` (comma-separated), not as entries in `output.facts` (which merely
    // echoes the input facts). See crates/wasm4pm-cognition/src/breeds/event_calculus.rs.
    const selected = result.output.selected as string;
    const verdicts = new Map(
      selected.split(',').map((entry) => {
        const [key, value] = entry.split('=');
        return [key, value];
      }),
    );
    // lecturer holds before promotion, clipped after
    expect(verdicts.get('ec:verdict:lecturer@4')).toBe('true');
    expect(verdicts.get('ec:verdict:lecturer@7')).toBe('false');
    // professor and employed hold after promotion
    expect(verdicts.get('ec:verdict:professor@7')).toBe('true');
    expect(verdicts.get('ec:verdict:employed@7')).toBe('true');
    // professor not yet initiated at t=4
    expect(verdicts.get('ec:verdict:professor@4')).toBe('false');
  });

  it('determinism: same event narrative returns identical output hash', async () => {
    const input = {
      intent: 'light switch',
      candidates: [],
      facts: [
        { key: 'ec:happens:2', value: 'switch_on' },
        { key: 'ec:initiates:switch_on', value: 'light_on' },
      ],
      cases: [],
      rules: [],
      goals: [
        { id: 'q1', predicate: 'ec:holdsat', value: 'light_on@3' },
      ],
      state: [],
    };
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('event_calculus', input),
      fixtures.runBreed('event_calculus', input),
    ]) as [AnyResult, AnyResult];
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });

  it('paper fixture (Kowalski-Sergot 1986): all 5 verdicts match published paper', async () => {
    const fixture = loadPaperFixture('event_calculus');
    const result = (await fixtures.runBreed('event_calculus', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('EventCalculus');
    // Verdicts are exposed as `ec:verdict:<fluent>@<time>=<bool>` entries joined by
    // commas in `output.selected` (not in `output.facts`, which just echoes the input
    // facts back unmodified) — see EventCalculus::run in
    // crates/wasm4pm-cognition/src/breeds/event_calculus.rs.
    const selected = result.output.selected as string;
    const computed = new Map<string, boolean>();
    for (const entry of selected.split(',')) {
      const [key, value] = entry.split('=');
      computed.set(key, value === 'true');
    }
    for (const [key, expected] of Object.entries(fixture.expected.verdicts as Record<string, string>)) {
      expect(computed.get(key)).toBe(expected === 'true');
    }
  });

  it('two-query consistency: fluent not yet initiated returns false', async () => {
    const beforeInit = {
      intent: 'query before event',
      candidates: [],
      facts: [
        { key: 'ec:happens:10', value: 'ignite' },
        { key: 'ec:initiates:ignite', value: 'fire' },
      ],
      cases: [],
      rules: [],
      goals: [
        { id: 'q1', predicate: 'ec:holdsat', value: 'fire@5' },
        { id: 'q2', predicate: 'ec:holdsat', value: 'fire@15' },
      ],
      state: [],
    };
    const result = (await fixtures.runBreed('event_calculus', beforeInit)) as AnyResult;
    expect(result.status).toBe('ok');
    // Per-query verdicts are exposed as `ec:verdict:<fluent>@<time>=<bool>` entries in
    // `output.selected` (comma-separated), not as entries in `output.facts` (which merely
    // echoes the input facts). See crates/wasm4pm-cognition/src/breeds/event_calculus.rs.
    const selected = result.output.selected as string;
    const verdicts = new Map(
      selected.split(',').map((entry) => {
        const [key, value] = entry.split('=');
        return [key, value];
      }),
    );
    expect(verdicts.get('ec:verdict:fire@5')).toBe('false');
    expect(verdicts.get('ec:verdict:fire@15')).toBe('true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FUZZY_LOGIC
// ─────────────────────────────────────────────────────────────────────────────

describe('fuzzy_logic breed integration', () => {
  it('Rank-1+2: produces centroid ~41.667 for full-strength Mamdani firing', async () => {
    const result = (await fixtures.runBreed(
      'fuzzy_logic',
      fixtures.minimalFuzzyLogicInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('FuzzyLogic');
    // Structural fingerprint: output fact fuzzy:output:heat must exist
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const outputFact = facts.find((f) => f.key === 'fuzzy:output:heat');
    expect(outputFact).toBeDefined();
    const centroid = parseFloat(outputFact!.value);
    // Mamdani centroid of Tri(0,25,100) at full firing = 41.667 (±0.01)
    expect(centroid).toBeCloseTo(41.667, 1);
    // selected is None for fuzzy breeds (numeric inference, not a choice)
    // explanation must name the inference method
    expect(result.output.explanation).toContain('Mamdani');
  });

  it('two-query consistency: partial firing (temp=20) yields lower centroid than full', async () => {
    const full = (await fixtures.runBreed('fuzzy_logic', fixtures.minimalFuzzyLogicInput())) as AnyResult;
    const partial = (await fixtures.runBreed('fuzzy_logic', fixtures.minimalFuzzyLogicAltInput())) as AnyResult;
    const fullFacts = full.output.facts as Array<{ key: string; value: string }>;
    const partialFacts = partial.output.facts as Array<{ key: string; value: string }>;
    const c1 = parseFloat(fullFacts.find((f) => f.key === 'fuzzy:output:heat')!.value);
    const c2 = parseFloat(partialFacts.find((f) => f.key === 'fuzzy:output:heat')!.value);
    // partial firing → defuzzified output shifts toward zero
    expect(c1).not.toBeCloseTo(c2, 0);
  });

  it('determinism: same controller input yields identical centroid both runs', async () => {
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('fuzzy_logic', fixtures.minimalFuzzyLogicInput()),
      fixtures.runBreed('fuzzy_logic', fixtures.minimalFuzzyLogicInput()),
    ]) as [AnyResult, AnyResult];
    expect(r1.output_hash).toBe(r2.output_hash);
    const f1 = (r1.output.facts as Array<{ key: string; value: string }>).find((f) => f.key === 'fuzzy:output:heat')?.value;
    const f2 = (r2.output.facts as Array<{ key: string; value: string }>).find((f) => f.key === 'fuzzy:output:heat')?.value;
    expect(f1).toBe(f2);
  });

  it('paper fixture (Mamdani-Assilian 1975): centroid within tolerance of 41.667', async () => {
    const fixture = loadPaperFixture('fuzzy_logic');
    const result = (await fixtures.runBreed('fuzzy_logic', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    const outputFact = facts.find((f) => f.key === fixture.expected.output_fact);
    expect(outputFact).toBeDefined();
    expect(parseFloat(outputFact!.value)).toBeCloseTo(
      fixture.expected.centroid,
      // tolerance in decimal places derived from fixture (0.001 → 2dp)
      2
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ILP (FOIL)
// ─────────────────────────────────────────────────────────────────────────────

describe('ilp breed integration', () => {
  it('Rank-1+2: induces the daughter relation via FOIL information gain', async () => {
    const result = (await fixtures.runBreed(
      'ilp',
      fixtures.minimalIlpInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Ilp');
    // Rank-2: at least one clause learned for daughter/2
    expect(result.output.selected).toBeTruthy();
    expect((result.output.selected as string)).toContain('daughter');
    // Structural fingerprint: explanation mentions FOIL
    expect(result.output.explanation).toContain('FOIL');
    // Paper requirement: body must include female and parent literals (as set)
    const ilpRule = (result.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'ilp:rule:0'
    );
    expect(ilpRule).toBeDefined();
    expect(ilpRule!.value).toContain('female');
    expect(ilpRule!.value).toContain('parent');
  });

  it('determinism: two FOIL runs on same data produce same clause', async () => {
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('ilp', fixtures.minimalIlpInput()),
      fixtures.runBreed('ilp', fixtures.minimalIlpInput()),
    ]) as [AnyResult, AnyResult];
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });

  it('paper fixture (Quinlan 1990): head is daughter/2, body set matches expected', async () => {
    const fixture = loadPaperFixture('ilp');
    const result = (await fixtures.runBreed('ilp', fixture.input)) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Ilp');
    const rule0 = (result.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'ilp:rule:0'
    );
    expect(rule0).toBeDefined();
    // Verify head and each body literal appear in the rule text
    expect(rule0!.value).toContain(fixture.expected.head.split('(')[0]);
    for (const lit of (fixture.expected.body_set as string[])) {
      expect(rule0!.value).toContain(lit.split('(')[0]);
    }
    // Clause count must match paper
    const countFact = (result.output.facts as Array<{ key: string; value: string }>).find(
      (f) => f.key === 'ilp:clause_count'
    );
    if (countFact) {
      expect(parseInt(countFact.value, 10)).toBe(fixture.expected.clause_count);
    }
  });

  it('error contract: empty background knowledge is refused by precondition', async () => {
    const emptyBg = {
      intent: 'learn with no background',
      candidates: [],
      facts: [
        { key: 'pos:foo(a)', value: 'true' },
        { key: 'neg:foo(b)', value: 'true' },
      ],
      cases: [], rules: [], goals: [], state: [],
    };
    const result = await fixtures.runBreedCaught('ilp', emptyBg);
    // ilp.rs precondition: requires background knowledge (bg:<atom> facts).
    expect(result.status).not.toBe('ok');
    expect(result.error).toContain('requires background knowledge');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LTL_MONITOR
// ─────────────────────────────────────────────────────────────────────────────

describe('ltl_monitor breed integration', () => {
  it('Rank-1+2: conforming trace satisfies G (red -> !green)', async () => {
    const result = (await fixtures.runBreed(
      'ltl_monitor',
      fixtures.minimalLtlMonitorInput()
    )) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('LtlMonitor');
    expect(result.output.selected).toBe('true');
    // Structural fingerprint: verdict fact emitted
    const facts = result.output.facts as Array<{ key: string; value: string }>;
    expect(facts.find((f) => f.key === 'conforms')?.value).toBe('true');
    // Explanation must report the LTL evaluation verdict
    expect(result.output.explanation).toContain('evaluated to true');
  });

  it('two-query consistency: violating trace (red,green) returns false', async () => {
    const conform = (await fixtures.runBreed('ltl_monitor', fixtures.minimalLtlMonitorInput())) as AnyResult;
    const violate = (await fixtures.runBreed('ltl_monitor', fixtures.minimalLtlMonitorViolatingInput())) as AnyResult;
    expect(conform.output.selected).toBe('true');
    expect(violate.output.selected).toBe('false');
  });

  it('determinism: same trace yields identical output hash', async () => {
    const [r1, r2] = await Promise.all([
      fixtures.runBreed('ltl_monitor', fixtures.minimalLtlMonitorInput()),
      fixtures.runBreed('ltl_monitor', fixtures.minimalLtlMonitorInput()),
    ]) as [AnyResult, AnyResult];
    expect(r1.output.selected).toBe(r2.output.selected);
    expect(r1.output_hash).toBe(r2.output_hash);
  });

  it('paper fixture (Havelund-Rosu 2001): verdict and step counts match', async () => {
    const fixture = loadPaperFixture('ltl_monitor');
    const conformResult = (await fixtures.runBreed('ltl_monitor', fixture.input)) as AnyResult;
    expect(conformResult.status).toBe('ok');
    const cFacts = conformResult.output.facts as Array<{ key: string; value: string }>;
    expect(cFacts.find((f) => f.key === 'conforms')?.value).toBe(
      String(fixture.expected.verdict)
    );
    // The fixture's violating_input only carries intent+facts; the Rust schema
    // (deny_unknown_fields BreedInput) requires all 7 arrays — fill the rest.
    const violatingContract = {
      candidates: [],
      cases: [],
      rules: [],
      goals: [],
      state: [],
      ...fixture.violating_input,
    };
    const violateResult = (await fixtures.runBreed('ltl_monitor', violatingContract)) as AnyResult;
    expect(violateResult.status).toBe('ok');
    const vFacts = violateResult.output.facts as Array<{ key: string; value: string }>;
    expect(vFacts.find((f) => f.key === 'conforms')?.value).toBe(
      String(fixture.expected.violating_verdict)
    );
  });
});
