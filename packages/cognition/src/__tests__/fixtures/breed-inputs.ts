/**
 * Minimal-but-valid `BreedInput` factories for each cognition breed.
 *
 * Each factory satisfies the breed's preconditions AND provides enough
 * structure for the run() to fire a non-trivial inference path (so that the
 * Rank-2 oracle in the integration test can detect real work).
 *
 * Source of truth for each breed's input shape:
 *   crates/wasm4pm-cognition/src/breeds/<breed>.rs
 */

import type {
  BreedInput,
  Candidate,
  Case,
  Fact,
  Goal,
  Rule,
  StateAtom,
} from '../../types.js';

// ---------------------------------------------------------------------------
// ELIZA — frame.rs (Weizenbaum 1966). Only requires non-empty intent.
// ---------------------------------------------------------------------------
export function minimalElizaInput(): BreedInput {
  return {
    intent: 'I feel anxious about deployment',
    candidates: [],
    facts: [],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// CBR — cbr.rs. Requires ≥1 case AND ≥1 query fact (Jaccard similarity).
// ---------------------------------------------------------------------------
export function minimalCbrInput(): BreedInput {
  const queryFacts: Fact[] = [
    { key: 'requirement', value: 'offline' },
    { key: 'scale', value: 'small' },
  ];
  const cases: Case[] = [
    {
      id: 'case-edge',
      intent: 'edge deployment',
      architecture: 'edge-local',
      outcome_score: 0.9,
      facts: [
        { key: 'requirement', value: 'offline' },
        { key: 'scale', value: 'small' },
      ],
    },
    {
      id: 'case-cloud',
      intent: 'cloud deployment',
      architecture: 'centralized-cloud',
      outcome_score: 0.7,
      facts: [
        { key: 'requirement', value: 'online' },
        { key: 'scale', value: 'large' },
      ],
    },
  ];
  return {
    intent: 'select architecture',
    candidates: [],
    facts: queryFacts,
    cases,
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// DENDRAL — dendral.rs. Requires ≥1 candidate; constraint facts (key="constraint")
// drive elimination via "forbid:<id>", "require:<token>", "max-score:<f>", "min-score:<f>".
// ---------------------------------------------------------------------------
export function minimalDendralInput(): BreedInput {
  const candidates: Candidate[] = [
    { id: 'centralized-cloud', score: 0.8, eliminated: false },
    { id: 'edge-offline', score: 0.7, eliminated: false },
    { id: 'hybrid-mesh', score: 0.6, eliminated: false },
  ];
  const facts: Fact[] = [
    // Eliminate centralized-cloud explicitly.
    { key: 'constraint', value: 'forbid:centralized-cloud' },
    // Require survivors to contain "offline".
    { key: 'constraint', value: 'require:offline' },
  ];
  return {
    intent: 'pick architecture under constraints',
    candidates,
    facts,
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// STRIPS — strips.rs. A *simplified* Sussman-style 2-block problem.
//
// NOTE: The full Sussman anomaly requires frame axioms (encoded in
// input.facts with key="frame") to preserve atoms across actions; without
// them, the goal-regression IDFS planner runs out of depth because each
// stacking action deletes intermediate state atoms (e.g. clear=B). To keep
// fixtures honest and the oracle truthful, we use a 1-step plan: stack A on
// B from the table, with B already clear.
//
// Initial state: A on table, B on table, A clear, B clear.
// Goal: A on B.
// One action: stack-A-on-B (pre: on=A-table, clear=A, clear=B; effect: on=A-B; !on=A-table; !clear=B).
// ---------------------------------------------------------------------------
export function minimalStripsInput(): BreedInput {
  const state: StateAtom[] = [
    { predicate: 'on', value: 'A-table' },
    { predicate: 'on', value: 'B-table' },
    { predicate: 'clear', value: 'A' },
    { predicate: 'clear', value: 'B' },
  ];
  const goals: Goal[] = [
    { id: 'g-aob', predicate: 'on', value: 'A-B' },
  ];
  const rules: Rule[] = [
    {
      id: 'stack-A-on-B',
      premise: ['on=A-table', 'clear=A', 'clear=B'],
      conclusion: 'on=A-B;!on=A-table;!clear=B',
      certainty: 1.0,
    },
  ];
  return {
    intent: 'stack two blocks',
    candidates: [],
    facts: [],
    cases: [],
    rules,
    goals,
    state,
  };
}

// ---------------------------------------------------------------------------
// PROLOG — prolog.rs (Robinson 1965). Backed by prolog8 kernel.
// Provide facts + a Horn-clause rule + a goal to query.
// ---------------------------------------------------------------------------
export function minimalPrologInput(): BreedInput {
  const facts: Fact[] = [
    { key: 'parent', value: 'alice' },
    { key: 'parent', value: 'bob' },
  ];
  const rules: Rule[] = [
    {
      id: 'r-ancestor',
      premise: ['parent'],
      conclusion: 'ancestor',
      certainty: 1.0,
    },
  ];
  const goals: Goal[] = [
    { id: 'g1', predicate: 'parent', value: 'alice' },
  ];
  return {
    intent: 'parent',
    candidates: [],
    facts,
    cases: [],
    rules,
    goals,
    state: [],
  };
}

// ---------------------------------------------------------------------------
// MYCIN — production_rules.rs. Forward chaining with certainty factors.
// Working memory seeded from facts (both "k=v" and bare "v" forms are inserted).
// Rules: premise atoms must appear in working memory with cf>0.2.
// ---------------------------------------------------------------------------
export function minimalMycinInput(): BreedInput {
  const facts: Fact[] = [
    { key: 'symptom', value: 'fever' },
    { key: 'symptom', value: 'cough' },
  ];
  const rules: Rule[] = [
    {
      id: 'r1-flu',
      // Mycin checks both "key=value" and bare "value" in working memory; using
      // the bare form here so rule fires.
      premise: ['fever', 'cough'],
      conclusion: 'diagnosis=flu',
      certainty: 0.8,
    },
    {
      id: 'r2-rest',
      premise: ['diagnosis=flu'],
      conclusion: 'treatment=rest',
      certainty: 0.9,
    },
  ];
  return {
    intent: 'diagnose',
    candidates: [],
    facts,
    cases: [],
    rules,
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// GPS — gps.rs. Means-ends with goal regression. Same encoding as STRIPS.
// Use a *trivially achievable* goal so the gap can be reduced in one operator.
// ---------------------------------------------------------------------------
export function minimalGpsInput(): BreedInput {
  const state: StateAtom[] = [
    { predicate: 'at', value: 'home' },
  ];
  const goals: Goal[] = [
    { id: 'g-office', predicate: 'at', value: 'office' },
  ];
  const rules: Rule[] = [
    {
      id: 'op-drive',
      premise: ['at=home'],
      conclusion: 'at=office;!at=home',
      certainty: 1.0,
    },
  ];
  return {
    intent: 'commute',
    candidates: [],
    facts: [],
    cases: [],
    rules,
    goals,
    state,
  };
}

// ---------------------------------------------------------------------------
// SOAR — soar.rs. Preference-based selection over candidates.
// Use a "best:<id>" preference so the survivor set is exactly one.
// ---------------------------------------------------------------------------
export function minimalSoarInput(): BreedInput {
  const candidates: Candidate[] = [
    { id: 'op-A', score: 0.5, eliminated: false },
    { id: 'op-B', score: 0.7, eliminated: false },
    { id: 'op-C', score: 0.6, eliminated: false },
  ];
  const facts: Fact[] = [
    { key: 'pref', value: 'best:op-B' },
    { key: 'pref', value: 'prohibit:op-C' },
  ];
  return {
    intent: 'pick operator',
    candidates,
    facts,
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// HEARSAY — hearsay.rs. Blackboard consensus.
// Initial hypotheses come from facts; KSs are encoded in rules.
// trigger = rule.premise[0] must MATCH a blackboard content string `key:value`.
// ---------------------------------------------------------------------------
export function minimalHearsayInput(): BreedInput {
  const facts: Fact[] = [
    { key: 'phone', value: 'TH' },
    { key: 'phone', value: 'AH' },
  ];
  const rules: Rule[] = [
    {
      id: 'ks-th-to-the',
      premise: ['phone:TH'],
      conclusion: 'word:THE',
      certainty: 0.7,
    },
    {
      id: 'ks-ah-to-the',
      premise: ['phone:AH'],
      conclusion: 'word:THE',
      certainty: 0.6,
    },
  ];
  return {
    intent: 'speech',
    candidates: [],
    facts,
    cases: [],
    rules,
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// AUTOINSTINCT NEUROSIS — neurosis.rs. Requires ≥1 fact. "belief:CONCEPT" key format.
// ---------------------------------------------------------------------------
export function autoinstinctNeurosisInput(): { breed: string; contract: BreedInput } {
  return {
    breed: 'autoinstinct_neurosis',
    contract: {
      intent: '',
      facts: [
        { key: 'belief:safety', value: '0.8' },
        { key: 'belief:control', value: '0.3' },
      ],
      candidates: [],
      rules: [],
      cases: [],
      goals: [],
      state: [],
    },
  };
}

// ---------------------------------------------------------------------------
// AUTOINSTINCT VISION — vision.rs. Requires ≥1 fact. key=shape, value=object_id.
// "supported_by:<OBJ>" key records support relationships.
// ---------------------------------------------------------------------------
export function autoinstinctVisionInput(): { breed: string; contract: BreedInput } {
  return {
    breed: 'autoinstinct_vision',
    contract: {
      intent: '',
      facts: [
        { key: 'cube', value: 'A' },
        { key: 'pyramid', value: 'B' },
        { key: 'supported_by:B', value: 'A' },
      ],
      candidates: [],
      rules: [],
      cases: [],
      goals: [],
      state: [],
    },
  };
}

// ---------------------------------------------------------------------------
// AUTOINSTINCT SEMANTICS — semantics.rs. Requires non-empty intent sentence.
// Parses intent using Schank CD primitives; facts/tokens not used.
// ---------------------------------------------------------------------------
export function autoinstinctSemanticsInput(): { breed: string; contract: BreedInput } {
  return {
    breed: 'autoinstinct_semantics',
    contract: {
      intent: 'John give book to Mary',
      candidates: [],
      facts: [],
      rules: [],
      cases: [],
      goals: [],
      state: [],
    },
  };
}

// ---------------------------------------------------------------------------
// AUTOINSTINCT LEARNING — learning.rs. Requires ≥1 goal. Goals form goal bitmask;
// facts form initial state bitmask. 0 initial facts → planner must flip all goal bits.
// ---------------------------------------------------------------------------
export function autoinstinctLearningInput(): { breed: string; contract: BreedInput } {
  return {
    breed: 'autoinstinct_learning',
    contract: {
      intent: '',
      facts: [],
      candidates: [],
      rules: [],
      cases: [],
      goals: [
        { id: 'g0', predicate: 'achieve', value: 'sub-goal-0' },
        { id: 'g1', predicate: 'achieve', value: 'sub-goal-1' },
        { id: 'g2', predicate: 'achieve', value: 'sub-goal-2' },
      ],
      state: [],
    },
  };
}

// ---------------------------------------------------------------------------
// HTN PLANNING — htn_planning.rs. Shop2-style total order decomposition.
// ---------------------------------------------------------------------------
export function minimalHtnPlanningInput(): BreedInput {
  return {
    intent: 'travel',
    candidates: [],
    facts: [],
    cases: [],
    state: [
      { predicate: 'at', value: 'home' },
      { predicate: 'cash', value: 'high' }
    ],
    goals: [
      { id: 'g1', predicate: 'task', value: 'travel' }
    ],
    rules: [
      {
        id: 'method:travel:taxi',
        premise: ['at=home'],
        conclusion: 'op:hail_taxi;op:pay_taxi',
        certainty: 1.0
      },
      {
        id: 'op:hail_taxi',
        premise: [],
        conclusion: 'in=taxi',
        certainty: 1.0
      },
      {
        id: 'op:pay_taxi',
        premise: ['in=taxi', 'cash=high'],
        conclusion: '!in=taxi;at=dest',
        certainty: 1.0
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// runBreed — call into the real WASM kernel (no mocks; FM-5 compliant).
// ---------------------------------------------------------------------------
export async function runBreed(
  breed: string,
  contract: BreedInput,
  options?: { profile?: string }
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasm: any = await import('wasm4pm-cognition' as string);
  // Rust schema (`ValidatedRunOptions`) rejects `null`; omit when not provided.
  const payload: Record<string, unknown> = { breed, contract };
  if (options !== undefined) payload.options = options;
  const inputJson = JSON.stringify(payload);
  const raw = wasm.cognition_run(inputJson);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
