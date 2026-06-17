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
// CSP AC-3 — csp_ac3.rs. Finite-domain Constraint Satisfaction via AC-3.
// ---------------------------------------------------------------------------
export function minimalCspAc3Input(): BreedInput {
  return {
    intent: 'solve coloring',
    candidates: [],
    facts: [
      { key: 'csp-var', value: 'V1:R,G,B' },
      { key: 'csp-var', value: 'V2:R,G,B' },
      { key: 'csp-constraint', value: 'V1!=V2' }
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// DEFAULT LOGIC — default_logic.rs. Reiter normal defaults.
// ---------------------------------------------------------------------------
export function minimalDefaultLogicInput(): BreedInput {
  return {
    intent: 'solve default rules',
    candidates: [],
    facts: [
      { key: 'bird', value: 'tweety' }
    ],
    cases: [],
    rules: [
      {
        id: 'r_default',
        premise: ['tweety', 'unless:non_flying'],
        conclusion: 'flies',
        certainty: 1.0
      }
    ],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// DEMPSTER-SHAFER — dempster_shafer.rs. Dempster combination.
// ---------------------------------------------------------------------------
export function minimalDempsterShaferInput(): BreedInput {
  return {
    intent: 'evaluate belief',
    candidates: [],
    facts: [],
    cases: [],
    rules: [
      { id: 'source1', premise: [], conclusion: 'flim', certainty: 0.6 },
      { id: 'source2', premise: [], conclusion: 'flam', certainty: 0.7 }
    ],
    goals: [
      { id: 'query', predicate: 'query', value: 'flim' }
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// FRAMES INHERITANCE — frames_inheritance.rs. Multiple inheritance with overrides.
// ---------------------------------------------------------------------------
export function minimalFramesInheritanceInput(): BreedInput {
  return {
    intent: 'resolve widget_a weight',
    candidates: [],
    facts: [
      { key: 'frame:widget_a:isa', value: 'widget' },
      { key: 'frame:widget:slot:weight:default', value: '10kg' },
      { key: 'frame:widget_a:slot:weight', value: '5kg' }
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// EBL — ebl.rs. Explanation-Based Learning.
// ---------------------------------------------------------------------------
export function minimalEblInput(): BreedInput {
  return {
    intent: 'learn',
    candidates: [],
    facts: [
      { key: 'has_handle(obj1)', value: 'true' },
      { key: 'concave(obj1)', value: 'true' }
    ],
    cases: [],
    rules: [
      { id: 'r1', premise: ['cup(?x)'], conclusion: 'drinkable(?x)', certainty: 1.0 },
      { id: 'r2', premise: ['has_handle(?y)', 'concave(?y)'], conclusion: 'cup(?y)', certainty: 1.0 }
    ],
    goals: [
      { id: 'g1', predicate: 'drinkable(obj1)', value: 'true' }
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ASP — asp.rs. Stable Models.
// ---------------------------------------------------------------------------
export function minimalAspInput(): BreedInput {
  return {
    intent: 'solve',
    candidates: [
      { id: 'a', score: 0.5, eliminated: false },
      { id: 'b', score: 0.5, eliminated: false },
    ],
    facts: [],
    cases: [],
    rules: [
      { id: 'r1', premise: ['not b'], conclusion: 'a', certainty: 1.0 },
      { id: 'r2', premise: ['not a'], conclusion: 'b', certainty: 1.0 },
    ],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// DESCRIPTION LOGIC — description_logic.rs. Ontological subsumption & consistency.
// ---------------------------------------------------------------------------
export function minimalDescriptionLogicInput(): BreedInput {
  return {
    intent: 'classify',
    candidates: [
      { id: 'x', score: 0.5, eliminated: false },
    ],
    facts: [
      { key: 'dl:subclass:A', value: 'B' },
      { key: 'dl:subclass:B', value: 'C' },
    ],
    cases: [],
    rules: [],
    goals: [
      { id: 'g1', predicate: 'dl:subsumes', value: 'A:C' },
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ABDUCTIVE LP — abductive_lp.rs. Abductive Logic Programming.
// ---------------------------------------------------------------------------
export function minimalAbductiveLpInput(): BreedInput {
  return {
    intent: 'abduce',
    candidates: [
      { id: 'c', score: 0.5, eliminated: false },
    ],
    facts: [
      { key: 'alp:abducible:a', value: 'true' },
      { key: 'alp:abducible:b', value: 'true' },
      { key: 'alp:abducible:c', value: 'true' },
      { key: 'alp:abducible:d', value: 'true' },
    ],
    cases: [],
    rules: [
      { id: 'r1', premise: ['a', 'b'], conclusion: 'g', certainty: 1.0 },
      { id: 'r2', premise: ['c'], conclusion: 'g', certainty: 1.0 },
    ],
    goals: [
      { id: 'g1', predicate: 'alp:observe', value: 'g' },
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ABDUCTIVE IBE — abductive_ibe.rs. Thagard ECHO coherence model.
// ---------------------------------------------------------------------------
export function minimalAbductiveIbeInput(): BreedInput {
  return {
    intent: 'coherence',
    candidates: [
      { id: 'H1', score: 0.5, eliminated: false },
      { id: 'H2', score: 0.5, eliminated: false },
    ],
    facts: [
      { key: 'ibe:obs:E1', value: 'true' },
      { key: 'ibe:obs:E2', value: 'true' },
      { key: 'ibe:hyp:H1:covers', value: 'E1,E2' },
      { key: 'ibe:hyp:H1:cost', value: '1.0' },
      { key: 'ibe:hyp:H2:covers', value: 'E1' },
      { key: 'ibe:hyp:H2:cost', value: '1.0' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// PARTIAL ORDER PLAN — partial_order_plan.rs.
// ---------------------------------------------------------------------------
export function minimalPartialOrderPlanInput(): BreedInput {
  return {
    intent: 'planning',
    candidates: [],
    // Grammar per partial_order_plan.rs: operators are pop:op:<name>:{pre,add,del}
    // facts; goals/state use bare propositional atoms.
    facts: [
      { key: 'pop:op:pickup:pre', value: 'at_depot' },
      { key: 'pop:op:pickup:add', value: 'holding' },
      { key: 'pop:op:pickup:del', value: 'at_depot' },
    ],
    cases: [],
    rules: [],
    goals: [
      { id: 'g1', predicate: 'holding', value: 'true' },
    ],
    state: [
      { predicate: 'at_depot', value: 'true' },
    ],
  };
}

// ---------------------------------------------------------------------------
// EVENT CALCULUS — event_calculus.rs.
// ---------------------------------------------------------------------------
export function minimalEventCalculusInput(): BreedInput {
  return {
    intent: 'reasoning',
    candidates: [],
    facts: [
      { key: 'initially', value: 'light_off' },
      { key: 'happens', value: 'switch_on,2' },
      { key: 'initiates', value: 'switch_on,light_on' },
      { key: 'terminates', value: 'switch_on,light_off' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// MDP — mdp.rs.
// ---------------------------------------------------------------------------
export function minimalMdpInput(): BreedInput {
  return {
    intent: 'reinforcement_learning',
    candidates: [],
    facts: [
      // Grammar per mdp.rs: mdp:gamma, mdp:trans:<s>:<a> = "s':p", mdp:reward:<s>:<a>.
      { key: 'mdp:gamma', value: '0.5' },
      { key: 'mdp:trans:s0:go', value: 's1:1.0' },
      { key: 'mdp:trans:s1:go', value: 's1:1.0' },
      { key: 'mdp:reward:s0:go', value: '10.0' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// VERSION SPACE — version_space.rs.
// ---------------------------------------------------------------------------
export function minimalVersionSpaceInput(): BreedInput {
  return {
    intent: 'learning',
    candidates: [],
    facts: [
      { key: 'attribute', value: 'Color: Red, Blue' },
      { key: 'example', value: 'Color=Red,positive' },
      { key: 'classify', value: 'Color=Red' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// NAIVE PHYSICS — naive_physics.rs. Hayes 1979/1985 manifesto.
// Requires np: prefixed facts: np:on, np:liquid, np:ground, np:remove.
// ---------------------------------------------------------------------------
export function minimalNaivePhysicsInput(): BreedInput {
  return {
    intent: 'predict what happens when the table is removed',
    candidates: [],
    facts: [
      { key: 'np:ground:floor', value: 'true' },
      { key: 'np:on:table', value: 'floor' },
      { key: 'np:on:cup', value: 'table' },
      { key: 'np:liquid:water', value: 'cup' },
      { key: 'np:remove:table', value: 'true' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// PROBLOG — problog.rs. De Raedt et al. 2007 distribution semantics.
// Requires pfact:<atom> probability facts + Horn rules + a single goals[0] query.
// ---------------------------------------------------------------------------
export function minimalProblogInput(): BreedInput {
  return {
    intent: 'compute the exact success probability of wet',
    candidates: [],
    facts: [
      { key: 'pfact:rain', value: '0.2' },
      { key: 'pfact:sprinkler', value: '0.2' },
      { key: 'pfact:hose', value: '0.3' },
    ],
    cases: [],
    rules: [
      { id: 'r-rain', premise: ['rain'], conclusion: 'wet', certainty: 1.0 },
      { id: 'r-sprinkler', premise: ['sprinkler'], conclusion: 'wet', certainty: 1.0 },
      { id: 'r-hose', premise: ['hose'], conclusion: 'wet', certainty: 1.0 },
    ],
    goals: [
      { id: 'g1', predicate: 'query', value: 'wet' },
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// QUALITATIVE REASON — qualitative_reason.rs. de Kleer & Brown 1984.
// qr:confluence:<id> = "+x,-y,-z"; qr:sign:<v> = "+"|"0"|"-".
// The valve confluence with p=+ and a=- is the canonical ambiguous example.
// ---------------------------------------------------------------------------
export function minimalQualitativeReasonInput(): BreedInput {
  return {
    intent: 'envision the pressure-regulator valve confluence (de Kleer & Brown 1984)',
    candidates: [],
    facts: [
      { key: 'qr:confluence:valve', value: '+p,+a,-q' },
      { key: 'qr:sign:p', value: '+' },
      { key: 'qr:sign:a', value: '-' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// RL SYMBOLIC — rl_symbolic.rs. Watkins & Dayan 1992 Q-learning.
// mdp:t:<s>:<a> = successor; mdp:r:<s>:<a> = reward; rl:episodes = count.
// ---------------------------------------------------------------------------
export function minimalRlSymbolicInput(): BreedInput {
  return {
    intent: 'learn the optimal policy for the two-state goal task',
    candidates: [],
    facts: [
      { key: 'mdp:gamma', value: '0.9' },
      { key: 'mdp:start', value: 's0' },
      { key: 'mdp:terminal:goal', value: 'true' },
      { key: 'mdp:t:s0:go', value: 'goal' },
      { key: 'mdp:t:s0:stay', value: 's0' },
      { key: 'mdp:r:s0:go', value: '1.0' },
      { key: 'rl:episodes', value: '300' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ACT-R — act_r.rs. Anderson & Lebiere 1998, Ch. 3 activation eq + Ch. 9
// addition-fact retrieval (3+4=7 vs neighbour 3+5=8).
// ---------------------------------------------------------------------------
export function minimalActRInput(): BreedInput {
  return {
    intent: 'retrieve the sum of 3 + 4',
    candidates: [],
    facts: [
      { key: 'goal', value: 'add' },
      { key: 'addend1', value: '3' },
      { key: 'addend2', value: '4' },
    ],
    cases: [
      {
        id: 'fact34',
        intent: 'addition fact',
        architecture: 'declarative-chunk',
        outcome_score: 0.5,
        facts: [
          { key: 'addend1', value: '3' },
          { key: 'addend2', value: '4' },
          { key: 'sum', value: '7' },
        ],
      },
      {
        id: 'fact35',
        intent: 'addition fact',
        architecture: 'declarative-chunk',
        outcome_score: 0.3,
        facts: [
          { key: 'addend1', value: '3' },
          { key: 'addend2', value: '5' },
          { key: 'sum', value: '8' },
        ],
      },
    ],
    rules: [
      {
        id: 'p-retrieve-sum',
        premise: ['goal=add'],
        conclusion: 'retrieve:addend1=3',
        certainty: 0.9,
      },
    ],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// Allen Temporal — allen_temporal.rs. Allen 1983 Table 1: meets ; during = o|s|d
// ---------------------------------------------------------------------------
export function minimalAllenTemporalInput(): BreedInput {
  return {
    intent: 'propagate temporal constraints',
    candidates: [],
    facts: [
      { key: 'relation', value: 'A,B,m' },
      { key: 'relation', value: 'B,C,d' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// Analogy SME — analogy_sme.rs. Falkenhainer, Forbus & Gentner 1989,
// Section 5.1: solar-system / Rutherford-atom mapping.
// ---------------------------------------------------------------------------
export function minimalAnalogySmeInput(): BreedInput {
  return {
    intent: 'map the solar system onto the Rutherford atom',
    candidates: [],
    facts: [
      { key: 'base:0', value: '(greater (mass sun) (mass planet))' },
      { key: 'base:1', value: '(revolve planet sun)' },
      { key: 'base:2', value: '(cause (greater (mass sun) (mass planet)) (revolve planet sun))' },
      { key: 'base:3', value: '(greater (temperature sun) (temperature planet))' },
      { key: 'target:0', value: '(greater (mass nucleus) (mass electron))' },
      { key: 'target:1', value: '(revolve electron nucleus)' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// Bayesian Network — bayesian_network.rs. Pearl 1988 Ch. 2 burglary/alarm net.
// Exact posterior P(B | JohnCalls=t, MaryCalls=t) = 0.284171835
// ---------------------------------------------------------------------------
export function minimalBayesianNetworkInput(): BreedInput {
  return {
    intent: 'diagnose burglary from phone calls',
    candidates: [],
    facts: [
      { key: 'cpt:B', value: '0.001' },
      { key: 'cpt:E', value: '0.002' },
      { key: 'cpt:A|B,E', value: '0.001,0.29,0.94,0.95' },
      { key: 'cpt:J|A', value: '0.05,0.90' },
      { key: 'cpt:M|A', value: '0.01,0.70' },
      { key: 'evidence:J', value: 'true' },
      { key: 'evidence:M', value: 'true' },
    ],
    cases: [],
    rules: [],
    goals: [
      { id: 'g1', predicate: 'query', value: 'prob:B' },
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// Belief Merging — belief_merging.rs. Konieczny & Pino Pérez 2002 Sec 5-6.
// Profile {K1=p∧q, K2=p∧q, K3=¬p∧¬q}: Σ selects majority world (p,q).
// ---------------------------------------------------------------------------
export function minimalBeliefMergingInput(): BreedInput {
  return {
    intent: 'merge conflicting belief bases under sum aggregation',
    candidates: [],
    facts: [
      { key: 'bm:atoms', value: 'p,q' },
      { key: 'bm:base:1', value: 'p,q' },
      { key: 'bm:base:2', value: 'p,q' },
      { key: 'bm:base:3', value: '-p,-q' },
      { key: 'bm:ic', value: 'true' },
      { key: 'bm:operator', value: 'sum' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// Circumscription — circumscription.rs. McCarthy 1980 Sec 4: bird/penguin
// example minimizing abnormality. Tweety flies; Opus (penguin) does not.
// ---------------------------------------------------------------------------
export function minimalCircumscriptionInput(): BreedInput {
  return {
    intent: 'circumscribe abnormality over the bird/penguin theory',
    candidates: [],
    facts: [
      { key: 'bird_tweety', value: 'true' },
      { key: 'bird_opus', value: 'true' },
      { key: 'penguin_opus', value: 'true' },
    ],
    cases: [],
    rules: [
      {
        id: 'r-fly-tweety',
        premise: ['bird_tweety', 'not_ab_bird_tweety'],
        conclusion: 'flies_tweety',
        certainty: 1.0,
      },
      {
        id: 'r-fly-opus',
        premise: ['bird_opus', 'not_ab_bird_opus'],
        conclusion: 'flies_opus',
        certainty: 1.0,
      },
      {
        id: 'r-penguin-ab',
        premise: ['penguin_opus'],
        conclusion: 'ab_bird_opus',
        certainty: 1.0,
      },
    ],
    goals: [
      { id: 'g1', predicate: 'entail', value: 'flies_tweety' },
      { id: 'g2', predicate: 'entail', value: 'flies_opus' },
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// CLP — clp.rs. Jaffar & Lassez 1987 POPL: CLP scheme over FD.
// Propagation alone yields unique solution x=6, y=3 with zero backtracks.
// ---------------------------------------------------------------------------
export function minimalClpInput(): BreedInput {
  return {
    intent: 'solve arithmetic constraints by propagation (CLP scheme, FD instantiation)',
    candidates: [],
    facts: [
      { key: 'clp:var:x', value: '6..9' },
      { key: 'clp:var:y', value: '0..9' },
      { key: 'clp:constraint:c1', value: 'x=y+3' },
      { key: 'clp:constraint:c2', value: 'y<4' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ctl_check — Clarke, Emerson & Sistla 1986, mutual-exclusion safety AG!(c1&c2)
// ---------------------------------------------------------------------------
export function minimalCtlCheckInput(): BreedInput {
  return {
    intent: 'verify mutual exclusion safety',
    candidates: [],
    facts: [
      { key: 'ts:init', value: 's0' },
      { key: 'ts:edge:s0', value: 's1,s3' },
      { key: 'ts:edge:s1', value: 's2,s5' },
      { key: 'ts:edge:s2', value: 's0' },
      { key: 'ts:edge:s3', value: 's4,s5' },
      { key: 'ts:edge:s4', value: 's0' },
      { key: 'ts:edge:s5', value: 's6,s7' },
      { key: 'ts:edge:s6', value: 's3' },
      { key: 'ts:edge:s7', value: 's1' },
      { key: 'ts:label:s1', value: 't1' },
      { key: 'ts:label:s2', value: 'c1' },
      { key: 'ts:label:s3', value: 't2' },
      { key: 'ts:label:s4', value: 'c2' },
      { key: 'ts:label:s5', value: 't1,t2' },
      { key: 'ts:label:s6', value: 'c1,t2' },
      { key: 'ts:label:s7', value: 't1,c2' },
      { key: 'ctl:formula', value: 'A G !(c1 & c2)' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// episodic_memory — Tulving 1983 + Nuxoll & Laird 2007, temporal-kernel recall
// ---------------------------------------------------------------------------
export function minimalEpisodicMemoryInput(): BreedInput {
  return {
    intent: 'recall the most relevant kitchen episode',
    candidates: [],
    facts: [
      { key: 'place', value: 'kitchen' },
      { key: 'cue:t', value: '10' },
      { key: 'episode:ep-breakfast:t', value: '9' },
      { key: 'episode:ep-dinner:t', value: '2' },
    ],
    cases: [
      {
        id: 'ep-breakfast',
        intent: 'morning meal',
        architecture: 'episode',
        outcome_score: 0.5,
        facts: [
          { key: 'place', value: 'kitchen' },
          { key: 'meal', value: 'breakfast' },
        ],
      },
      {
        id: 'ep-dinner',
        intent: 'evening meal',
        architecture: 'episode',
        outcome_score: 0.5,
        facts: [
          { key: 'place', value: 'kitchen' },
          { key: 'meal', value: 'dinner' },
        ],
      },
    ],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// fuzzy_logic — Mamdani & Assilian 1975, steam-engine heat controller (centroid 41.667)
// ---------------------------------------------------------------------------
export function minimalFuzzyLogicInput(): BreedInput {
  return {
    intent: 'steam controller heat change',
    candidates: [],
    facts: [
      { key: 'fuzzy:temp:hot', value: 'tri:10,30,50' },
      { key: 'fuzzy:heat:change', value: 'tri:0,25,100' },
      { key: 'fuzzy:input:temp', value: '30' },
    ],
    cases: [],
    rules: [
      {
        id: 'pc1',
        premise: ['fuzzy:temp:hot'],
        conclusion: 'fuzzy:heat:change',
        certainty: 1.0,
      },
    ],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ilp — Quinlan 1990 FOIL, daughter relation induction from parent/female background
// ---------------------------------------------------------------------------
export function minimalIlpInput(): BreedInput {
  return {
    intent: 'learn the daughter relation',
    candidates: [],
    facts: [
      { key: 'bg:parent(ann,mary)', value: 'true' },
      { key: 'bg:parent(ann,tom)', value: 'true' },
      { key: 'bg:parent(tom,eve)', value: 'true' },
      { key: 'bg:parent(tom,ian)', value: 'true' },
      { key: 'bg:female(ann)', value: 'true' },
      { key: 'bg:female(mary)', value: 'true' },
      { key: 'bg:female(eve)', value: 'true' },
      { key: 'pos:daughter(mary,ann)', value: 'true' },
      { key: 'pos:daughter(eve,tom)', value: 'true' },
      { key: 'neg:daughter(tom,ann)', value: 'true' },
      { key: 'neg:daughter(eve,ann)', value: 'true' },
      { key: 'neg:daughter(ian,tom)', value: 'true' },
      { key: 'neg:daughter(ann,mary)', value: 'true' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ltl_monitor — Havelund & Roşu 2001, LTL progression traffic-light safety G(red->!green)
// ---------------------------------------------------------------------------
export function minimalLtlMonitorInput(): BreedInput {
  return {
    intent: 'monitor traffic light safety',
    candidates: [],
    facts: [
      { key: 'ltl:formula', value: 'G (red -> !green)' },
      { key: 'trace:0', value: 'red' },
      { key: 'trace:1', value: 'green' },
      { key: 'trace:2', value: 'red' },
      { key: 'trace:3', value: 'green' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

export function minimalLtlMonitorViolatingInput(): BreedInput {
  return {
    intent: 'monitor traffic light safety — violating trace',
    candidates: [],
    facts: [
      { key: 'ltl:formula', value: 'G (red -> !green)' },
      { key: 'trace:0', value: 'red' },
      { key: 'trace:1', value: 'red,green' },
      { key: 'trace:2', value: 'green' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// Marques-Silva & Sakallah 1999 — CDCL conflict analysis; pigeonhole PHP(3,2) is provably UNSAT
export function minimalSatCdclInput(): BreedInput {
  return {
    intent: 'decide pigeonhole PHP(3,2)',
    candidates: [],
    facts: [
      { key: 'clause:0', value: '1 2' },
      { key: 'clause:1', value: '-1 2' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// Schank & Abelson 1977 — SAM restaurant script; eating scene inferred from enter/order/pay/leave
export function minimalScriptSamInput(): BreedInput {
  return {
    intent: 'understand the restaurant story (Schank & Abelson 1977, Chapter 3)',
    candidates: [],
    facts: [
      { key: 'sam:event:1', value: 'enter:john' },
      { key: 'sam:event:2', value: 'order:john' },
      { key: 'sam:event:3', value: 'pay:john' },
      { key: 'sam:event:4', value: 'leave:john' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// Reiter 1991 — successor-state axioms; blocks-world pickup/putdown with frame-persist fluents
export function minimalSituationCalculusInput(): BreedInput {
  return {
    intent: 'progress blocks world through pickup(a); putdown(a, table)',
    candidates: [],
    facts: [
      { key: 'fluent:on_a_b', value: 'true' },
      { key: 'fluent:on_b_table', value: 'true' },
      { key: 'fluent:clear_a', value: 'true' },
      { key: 'fluent:handempty', value: 'true' },
      { key: 'fluent:color_b_red', value: 'true' },
      { key: 'action:pickup_a:pre', value: 'clear_a' },
      { key: 'action:pickup_a:pre', value: 'handempty' },
      { key: 'action:pickup_a:pre', value: 'on_a_b' },
      { key: 'action:pickup_a:add', value: 'holding_a' },
      { key: 'action:pickup_a:add', value: 'clear_b' },
      { key: 'action:pickup_a:del', value: 'on_a_b' },
      { key: 'action:pickup_a:del', value: 'handempty' },
      { key: 'action:pickup_a:del', value: 'clear_a' },
      { key: 'action:putdown_a:pre', value: 'holding_a' },
      { key: 'action:putdown_a:add', value: 'on_a_table' },
      { key: 'action:putdown_a:add', value: 'handempty' },
      { key: 'action:putdown_a:add', value: 'clear_a' },
      { key: 'action:putdown_a:del', value: 'holding_a' },
      { key: 'do:0', value: 'pickup_a' },
      { key: 'do:1', value: 'putdown_a' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// allen_temporal — alternate interval set with overlapping/during relations.
// ---------------------------------------------------------------------------
export function altAllenTemporalInput(): BreedInput {
  return {
    intent: 'propagate after/before and during constraints (Allen 1983)',
    candidates: [],
    facts: [
      { key: 'relation', value: 'A,B,p' },
      { key: 'relation', value: 'C,A,d' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// bayesian_network — alternate evidence set: only JohnCalls observed.
// ---------------------------------------------------------------------------
export function altBayesianNetworkInput(): BreedInput {
  return {
    intent: 'diagnose burglary from single phone call (Pearl 1988)',
    candidates: [],
    facts: [
      { key: 'cpt:B', value: '0.001' },
      { key: 'cpt:E', value: '0.002' },
      { key: 'cpt:A|B,E', value: '0.001,0.29,0.94,0.95' },
      { key: 'cpt:J|A', value: '0.05,0.90' },
      { key: 'cpt:M|A', value: '0.01,0.70' },
      { key: 'evidence:J', value: 'true' },
    ],
    cases: [],
    rules: [],
    goals: [
      { id: 'g1', predicate: 'query', value: 'prob:B' },
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// circumscription — alternate theory: only Tweety with no penguin exception.
// ---------------------------------------------------------------------------
export function altCircumscriptionInput(): BreedInput {
  return {
    intent: 'circumscribe abnormality — all birds fly (McCarthy 1980)',
    candidates: [],
    facts: [
      { key: 'bird_tweety', value: 'true' },
    ],
    cases: [],
    rules: [
      {
        id: 'r-fly',
        premise: ['bird_tweety'],
        conclusion: 'flies_tweety',
        certainty: 1.0,
      },
    ],
    goals: [
      // circumscription.rs precondition: at least one goal atom to test entailment.
      { id: 'g1', predicate: 'entail', value: 'flies_tweety' },
    ],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// sat_cdcl — UNSAT variant: pigeonhole PHP(3,2) (Marques-Silva & Sakallah 1999).
// Conflict-driven search is required (a level-0 unit conflict would learn
// nothing), so this instance genuinely forces ≥1 learned clause.
// ---------------------------------------------------------------------------
export function unsatSatCdclInput(): BreedInput {
  return {
    intent: 'decide pigeonhole PHP(3,2) — provably UNSAT with clause learning',
    candidates: [],
    facts: [
      { key: 'clause:00', value: '1 2' },
      { key: 'clause:01', value: '3 4' },
      { key: 'clause:02', value: '5 6' },
      { key: 'clause:03', value: '-1 -3' },
      { key: 'clause:04', value: '-1 -5' },
      { key: 'clause:05', value: '-3 -5' },
      { key: 'clause:06', value: '-2 -4' },
      { key: 'clause:07', value: '-2 -6' },
      { key: 'clause:08', value: '-4 -6' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// act_r — alternate working-memory context: subtraction retrieval.
// ---------------------------------------------------------------------------
export function altActRInput(): BreedInput {
  return {
    intent: 'retrieve subtraction fact 9 - 4',
    candidates: [],
    facts: [
      { key: 'goal', value: 'subtract' },
      { key: 'minuend', value: '9' },
      { key: 'subtrahend', value: '4' },
    ],
    cases: [
      {
        id: 'fact94',
        intent: 'subtraction fact',
        architecture: 'declarative-chunk',
        outcome_score: 0.6,
        facts: [
          { key: 'minuend', value: '9' },
          { key: 'subtrahend', value: '4' },
          { key: 'difference', value: '5' },
        ],
      },
    ],
    rules: [
      {
        id: 'r-retrieve-sub',
        premise: ['goal=subtract'],
        conclusion: 'retrieve:minuend=9',
        certainty: 1.0,
      },
    ],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// clp — alternate constraint set: x != y, y >= 3 — forces different labeling.
// ---------------------------------------------------------------------------
export function altClpInput(): BreedInput {
  return {
    intent: 'solve CLP(FD) with inequality and unary bound (Jaffar & Lassez 1987)',
    candidates: [],
    facts: [
      { key: 'clp:var:x', value: '1..5' },
      { key: 'clp:var:y', value: '1..5' },
      { key: 'clp:constraint:c1', value: 'x!=y' },
      { key: 'clp:constraint:c2', value: 'x<=2' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// script_sam — airport script: checkin/security/board observed; fly inferred.
// ---------------------------------------------------------------------------
export function airportScriptSamInput(): BreedInput {
  return {
    intent: 'understand airport story with inferred fly scene (Schank & Abelson 1977)',
    candidates: [],
    facts: [
      { key: 'sam:event:1', value: 'checkin:alice' },
      { key: 'sam:event:2', value: 'security:alice' },
      { key: 'sam:event:3', value: 'board:alice' },
      { key: 'sam:event:4', value: 'land:alice' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// situation_calculus — single-action case: just pickup_a; verifies frame-persist.
// ---------------------------------------------------------------------------
export function singleActionSituationCalculusInput(): BreedInput {
  return {
    intent: 'progress single pickup_a action; verify frame-persist on color_b_red',
    candidates: [],
    facts: [
      { key: 'fluent:on_a_b', value: 'true' },
      { key: 'fluent:clear_a', value: 'true' },
      { key: 'fluent:handempty', value: 'true' },
      { key: 'fluent:color_b_red', value: 'true' },
      { key: 'action:pickup_a:pre', value: 'clear_a' },
      { key: 'action:pickup_a:pre', value: 'handempty' },
      { key: 'action:pickup_a:pre', value: 'on_a_b' },
      { key: 'action:pickup_a:add', value: 'holding_a' },
      { key: 'action:pickup_a:add', value: 'clear_b' },
      { key: 'action:pickup_a:del', value: 'on_a_b' },
      { key: 'action:pickup_a:del', value: 'handempty' },
      { key: 'action:pickup_a:del', value: 'clear_a' },
      { key: 'do:0', value: 'pickup_a' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ctl_check — formula that FAILS: AF(p) on a cycle that never reaches p.
// ---------------------------------------------------------------------------
export function minimalCtlCheckFailInput(): BreedInput {
  return {
    intent: 'verify AF(p) fails on a cycle with no p-state (Clarke et al. 1986)',
    candidates: [],
    facts: [
      { key: 'ts:init', value: 's0' },
      { key: 'ts:edge:s0', value: 's1' },
      { key: 'ts:edge:s1', value: 's0' },
      { key: 'ts:label:s0', value: 'q' },
      { key: 'ts:label:s1', value: 'q' },
      // formula.rs tokenizer reads alphabetic words whole: "AF(p)" lexes as the
      // identifier "AF". Operators must be space-separated single letters.
      { key: 'ctl:formula', value: 'A F p' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// episodic_memory — alternate cue: office episode wins over kitchen by temporal proximity.
// ---------------------------------------------------------------------------
export function minimalEpisodicMemoryAltInput(): BreedInput {
  return {
    intent: 'recall office episode via temporal proximity (Tulving 1983)',
    candidates: [],
    facts: [
      { key: 'place', value: 'office' },
      { key: 'cue:t', value: '20' },
      { key: 'episode:ep-morning:t', value: '19' },
      { key: 'episode:ep-old:t', value: '1' },
    ],
    cases: [
      {
        id: 'ep-morning',
        intent: 'morning work session',
        architecture: 'episode',
        outcome_score: 0.5,
        facts: [
          { key: 'place', value: 'office' },
          { key: 'activity', value: 'coding' },
        ],
      },
      {
        id: 'ep-old',
        intent: 'old office memory',
        architecture: 'episode',
        outcome_score: 0.8,
        facts: [
          { key: 'place', value: 'office' },
          { key: 'activity', value: 'meeting' },
        ],
      },
    ],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// fuzzy_logic — alternate input: different crisp value → different rule fires.
// ---------------------------------------------------------------------------
export function minimalFuzzyLogicAltInput(): BreedInput {
  return {
    intent: 'steam controller with cold temperature (Mamdani & Assilian 1975)',
    candidates: [],
    facts: [
      { key: 'fuzzy:temp:cold', value: 'tri:0,10,25' },
      { key: 'fuzzy:heat:boost', value: 'tri:50,75,100' },
      { key: 'fuzzy:input:temp', value: '10' },
    ],
    cases: [],
    rules: [
      {
        id: 'r-cold',
        premise: ['fuzzy:temp:cold'],
        conclusion: 'fuzzy:heat:boost',
        certainty: 1.0,
      },
    ],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// version_space — Mitchell 1982 EnjoySport dataset (first two examples).
// ---------------------------------------------------------------------------
export function minimalVersionSpaceEnjoySportInput(): BreedInput {
  return {
    intent: 'candidate elimination on EnjoySport (Mitchell 1982)',
    candidates: [],
    facts: [
      { key: 'vs:attrs', value: 'Sky,AirTemp,Humidity,Wind,Water,Forecast' },
      { key: 'vs:example:1', value: 'Sunny,Warm,Normal,Strong,Warm,Same:+' },
      { key: 'vs:example:2', value: 'Sunny,Warm,High,Strong,Warm,Same:+' },
      { key: 'vs:example:3', value: 'Rainy,Cold,High,Strong,Warm,Change:-' },
      { key: 'vs:example:4', value: 'Sunny,Warm,High,Strong,Cool,Change:+' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// version_space — minimal two-attribute dataset for boundary verification.
// ---------------------------------------------------------------------------
export function minimalVersionSpaceSimpleInput(): BreedInput {
  return {
    intent: 'candidate elimination two-attribute simple case (Mitchell 1982)',
    candidates: [],
    facts: [
      { key: 'vs:attrs', value: 'Color,Size' },
      { key: 'vs:example:1', value: 'Red,Small:+' },
      { key: 'vs:example:2', value: 'Blue,Small:-' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// analogy_sme — alternate base: electric circuit mapped onto water flow.
// ---------------------------------------------------------------------------
export function altAnalogySmeInput(): BreedInput {
  return {
    intent: 'map electric circuit onto water-flow analogy (Gentner 1983)',
    candidates: [],
    facts: [
      { key: 'base:0', value: '(greater (voltage battery) (voltage bulb))' },
      { key: 'base:1', value: '(flow current battery bulb)' },
      { key: 'base:2', value: '(cause (greater (voltage battery) (voltage bulb)) (flow current battery bulb))' },
      { key: 'target:0', value: '(greater (pressure pump) (pressure nozzle))' },
      { key: 'target:1', value: '(flow water pump nozzle)' },
    ],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// runBreed — call into the real WASM kernel (FM-5 compliant — no init mocking).
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

// ---------------------------------------------------------------------------
// runBreedCaught — like runBreed, but precondition/schema failures from the
// Rust kernel are thrown as WASM errors; this normalizes them to an
// error-contract result `{ status: 'error', error }` for negative tests.
// ---------------------------------------------------------------------------
export async function runBreedCaught(
  breed: string,
  contract: BreedInput
): Promise<{ status: string; error: string; output?: unknown }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (await runBreed(breed, contract)) as any;
    return { status: r.status ?? 'error', error: '', output: r.output };
  } catch (e) {
    let msg = typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);
    try {
      const parsed = JSON.parse(msg);
      if (parsed && typeof parsed.error === 'string') msg = parsed.error;
    } catch {
      /* plain string error */
    }
    return { status: 'error', error: msg };
  }
}
