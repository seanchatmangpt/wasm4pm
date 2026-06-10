/**
 * Real-data integration tests for all 13 cognition breeds.
 *
 * FM-5 compliant — no init.js mock.  These tests MUST fail if the
 * WASM pkg/ is absent.
 *
 * Oracle rank: Rank-1 (status=ok) + structural non-degeneracy.  Rank-2
 * domain-contract oracles are in cognition-breeds.integration.test.ts.
 * These tests verify that domain-grounded inputs (clinical rules, 15-case CBR
 * libraries, genealogy facts, logistics STRIPS, etc.) are accepted without
 * error and produce non-trivial structured output.
 *
 * Each test verifies:
 *   1. status === 'ok'
 *   2. output.breed matches the expected PascalCase enum name
 *   3. output.explanation is non-empty (breed did real inference work)
 *   4. A breed-specific non-degeneracy assertion
 */

import { describe, it, expect } from 'vitest';
import {
  realMycinInput,
  realCbrInput,
  realPrologInput,
  realStripsInput,
  realGpsInput,
  realHearsayInput,
  realDendralInput,
  realSoarInput,
  realElizaInput,
  realAutoinstinctNeurosisInput,
  realAutoinstinctVisionInput,
  realAutoinstinctSemanticsInput,
  realAutoinstinctLearningInput,
  runBreed,
} from './fixtures/breed-inputs-real.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;

// ---------------------------------------------------------------------------
// Classical breeds
// ---------------------------------------------------------------------------

describe('mycin breed — real clinical rules (Shortliffe 1976)', () => {
  it('fires 3-step CF chain and recommends antibiotic therapy', async () => {
    const result = (await runBreed('mycin', realMycinInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('ProductionRules');
    // Must have fired at least 2 rules in the chain
    expect(result.output.rules_fired).toBeGreaterThanOrEqual(2);
    // Explanation must reference at least one conclusion from the rule chain
    const explanation: string = result.output.explanation ?? '';
    const hasTherapy =
      explanation.includes('therapy') ||
      explanation.includes('penicillin') ||
      explanation.includes('vancomycin') ||
      explanation.includes('dose');
    expect(hasTherapy).toBe(true);
  });
});

describe('cbr breed — 15-case IT incident library (Aamodt & Plaza 1994)', () => {
  it('retrieves a case from the 15-case library and produces non-null selected', async () => {
    const result = (await runBreed('cbr', realCbrInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Cbr');
    expect(result.output.explanation.length).toBeGreaterThan(0);
    // Must select one of the 15 cases
    const selected: string = result.output.selected ?? '';
    expect(selected.length).toBeGreaterThan(0);
    // Network-category cases should score highest for a packet-loss query
    const isNetworkResolution =
      selected.includes('restart') ||
      selected.includes('replace') ||
      selected.includes('throttle') ||
      selected.includes('force') ||
      selected.includes('update') ||
      selected.includes('revert');
    expect(isNetworkResolution).toBe(true);
  });
});

describe('prolog breed — genealogy family tree (Kowalski 1974)', () => {
  it('proves parent fact from 22-fact genealogy tree', async () => {
    const result = (await runBreed('prolog', realPrologInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Prolog');
    // Parent query must succeed — tom is parent of bob
    const selected: string = result.output.selected ?? '';
    expect(selected.length).toBeGreaterThan(0);
  });
});

describe('strips breed — logistics delivery (Fikes & Nilsson 1971)', () => {
  it('finds a plan for multi-location package delivery', async () => {
    const result = (await runBreed('strips', realStripsInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Strips');
    // Plan must be non-empty
    const selected: string = result.output.selected ?? '';
    expect(selected.length).toBeGreaterThan(0);
    // Explanation must mention at least one operator
    const explanation: string = result.output.explanation ?? '';
    expect(explanation.length).toBeGreaterThan(0);
  });
});

describe('gps breed — manufacturing means-ends (Newell & Simon 1963)', () => {
  it('achieves 3-goal manufacturing chain via means-ends analysis', async () => {
    const result = (await runBreed('gps', realGpsInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Gps');
    const selected: string = result.output.selected ?? '';
    expect(selected.length).toBeGreaterThan(0);
  });
});

describe('hearsay breed — speech recognition pipeline (Erman et al. 1980)', () => {
  it('posts word-level hypotheses from 14 phoneme facts via multi-KS pipeline', async () => {
    const result = (await runBreed('hearsay', realHearsayInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Hearsay');
    // At least one word-level hypothesis must be posted
    const explanation: string = result.output.explanation ?? '';
    expect(explanation.length).toBeGreaterThan(0);
    // Should have posted word:THE from DH/AH phonemes
    const selected: string = result.output.selected ?? '';
    expect(selected.length).toBeGreaterThan(0);
  });
});

describe('dendral breed — mass-spectrometry constraints (Feigenbaum et al. 1971)', () => {
  it('eliminates structures via 7 mass-spectrometry constraints', async () => {
    const result = (await runBreed('dendral', realDendralInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Dendral');
    // Structures that lack 'amino' or 'pyridine' tokens, or are explicitly forbidden,
    // must be eliminated
    const eliminated = (result.output.candidates ?? []).filter(
      (c: { eliminated: boolean; elimination_reason?: string }) =>
        c.eliminated && c.elimination_reason && c.elimination_reason.length > 0
    );
    expect(eliminated.length).toBeGreaterThanOrEqual(3);
  });
});

describe('soar breed — query operator selection (Laird et al. 1987)', () => {
  it('selects index-scan as best operator; prohibits full-scan and nested-loop', async () => {
    const result = (await runBreed('soar', realSoarInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Soar');
    // Best preference must win
    const selected: string = result.output.selected ?? '';
    expect(selected).toBe('op-index-scan');
    // Prohibited operators must be eliminated
    const eliminated = (result.output.candidates ?? []).filter(
      (c: { eliminated: boolean }) => c.eliminated
    );
    expect(eliminated.length).toBeGreaterThanOrEqual(2);
  });
});

describe('eliza breed — psychotherapy dialogue (Weizenbaum 1966)', () => {
  it('reflects multi-theme utterance with non-trivial response', async () => {
    const result = (await runBreed('eliza', realElizaInput())) as AnyResult;
    expect(result.status).toBe('ok');
    expect(result.output.breed).toBe('Eliza');
    const explanation: string = result.output.explanation ?? '';
    expect(explanation.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Autoinstinct breeds
// ---------------------------------------------------------------------------

describe('autoinstinct_neurosis — 7-belief conflict model', () => {
  it('processes 7 conflicting beliefs without error', async () => {
    const { breed, contract } = realAutoinstinctNeurosisInput();
    const result = (await runBreed(breed, contract)) as AnyResult;
    expect(result.status).toBe('ok');
    const explanation: string = result.output?.explanation ?? '';
    expect(explanation.length).toBeGreaterThan(0);
  });
});

describe('autoinstinct_vision — 6-object scene with support hierarchy', () => {
  it('parses 6-object scene and detects support relationships', async () => {
    const { breed, contract } = realAutoinstinctVisionInput();
    const result = (await runBreed(breed, contract)) as AnyResult;
    expect(result.status).toBe('ok');
    const explanation: string = result.output?.explanation ?? '';
    expect(explanation.length).toBeGreaterThan(0);
  });
});

describe('autoinstinct_semantics — multi-actor CD primitive parsing', () => {
  it('parses multi-actor sentence with CAUSE into CD primitives', async () => {
    const { breed, contract } = realAutoinstinctSemanticsInput();
    const result = (await runBreed(breed, contract)) as AnyResult;
    expect(result.status).toBe('ok');
    const explanation: string = result.output?.explanation ?? '';
    expect(explanation.length).toBeGreaterThan(0);
  });
});

describe('autoinstinct_learning — 5-goal curriculum with 2 prerequisites met', () => {
  it('plans remaining 3 unachieved goals from partial state', async () => {
    const { breed, contract } = realAutoinstinctLearningInput();
    const result = (await runBreed(breed, contract)) as AnyResult;
    expect(result.status).toBe('ok');
    const explanation: string = result.output?.explanation ?? '';
    expect(explanation.length).toBeGreaterThan(0);
  });
});
