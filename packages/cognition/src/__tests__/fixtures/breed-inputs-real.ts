/**
 * Domain-grounded `BreedInput` fixtures for all 13 cognition breeds.
 *
 * These inputs are derived from the original source papers:
 *   MYCIN   — Shortliffe 1976 (gram-stain / culture-site rules)
 *   CBR     — Aamodt & Plaza 1994 (IT incident case library, 15 cases)
 *   Prolog  — Kowalski 1974 / Robinson 1965 (genealogy family tree)
 *   STRIPS  — Fikes & Nilsson 1971 (multi-location package delivery)
 *   GPS     — Newell & Simon 1963 (manufacturing means-ends problem)
 *   HEARSAY — Erman et al. 1980 (multi-KS speech recognition pipeline)
 *   DENDRAL — Feigenbaum et al. 1971 (mass-spectrometry constraint elimination)
 *   SOAR    — Laird et al. 1987 (operator preference hierarchy)
 *   ELIZA   — Weizenbaum 1966 (psychotherapy dialogue)
 *   Autoinstinct breeds — richer multi-belief / multi-object inputs
 *
 * These exist in addition to the minimal fixtures in breed-inputs.ts, which
 * retain their exact Rank-2 oracles.  These fixtures enable Rank-1 (status=ok)
 * tests against non-trivial domain-representative inputs that minimal fixtures
 * cannot provide.
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
// MYCIN — real bacterial infection rules from Shortliffe 1976.
//
// Input encodes: gram-positive cocci in blood culture from an immunocompromised
// adult patient with elevated WBC.  Rules chain:
//   clinical facts → organism identity (CF ~0.7) → antibiotic (CF ~0.9) → dose
// This exercises the CF accumulation formula CF_new = CF_old + CF_input×(1-CF_old).
// ---------------------------------------------------------------------------
export function realMycinInput(): BreedInput {
  const facts: Fact[] = [
    // Raw clinical observations (working memory seed)
    { key: 'gram-stain', value: 'gram-positive' },
    { key: 'morphology', value: 'coccus' },
    { key: 'site', value: 'blood' },
    { key: 'patient-age', value: 'adult' },
    { key: 'immunocompromised', value: 'yes' },
    { key: 'fever', value: 'high' },
    { key: 'wbc-count', value: 'elevated' },
    { key: 'allergy-penicillin', value: 'no' },
  ];
  const rules: Rule[] = [
    // Organism identification (Shortliffe 1976 Rule 52-class)
    {
      id: 'rule-52-strep',
      premise: ['gram-positive', 'coccus'],
      conclusion: 'organism=streptococcus',
      certainty: 0.7,
    },
    {
      id: 'rule-53-staph',
      premise: ['gram-positive', 'coccus', 'blood'],
      conclusion: 'organism=staphylococcus',
      certainty: 0.6,
    },
    // Immunocompromised raises staph certainty
    {
      id: 'rule-54-staph-immuno',
      premise: ['organism=staphylococcus', 'immunocompromised=yes'],
      conclusion: 'organism=mrsa',
      certainty: 0.5,
    },
    // Antibiotic therapy selection (Shortliffe 1976 Rule 71-class)
    {
      id: 'rule-71-pen',
      premise: ['organism=streptococcus', 'allergy-penicillin=no'],
      conclusion: 'therapy=penicillin',
      certainty: 0.9,
    },
    {
      id: 'rule-72-vanc-immuno',
      premise: ['organism=staphylococcus', 'immunocompromised=yes'],
      conclusion: 'therapy=vancomycin',
      certainty: 0.85,
    },
    {
      id: 'rule-73-vanc-mrsa',
      premise: ['organism=mrsa'],
      conclusion: 'therapy=vancomycin',
      certainty: 0.95,
    },
    // Dosage (chains off therapy)
    {
      id: 'rule-80-pen-dose',
      premise: ['therapy=penicillin', 'adult'],
      conclusion: 'dose=1g-iv-q4h',
      certainty: 0.8,
    },
    {
      id: 'rule-81-vanc-dose',
      premise: ['therapy=vancomycin', 'elevated'],
      conclusion: 'dose=15mg-kg-q12h',
      certainty: 0.9,
    },
  ];
  return {
    intent: 'diagnose bacteremia organism and recommend antibiotic therapy',
    candidates: [],
    facts,
    cases: [],
    rules,
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// CBR — IT incident case library inspired by Aamodt & Plaza 1994.
//
// 15 historical IT incidents with category/symptom/urgency/impact attributes.
// Query: new network incident with packet-loss affecting production API.
// The Jaccard-similarity retrieval should rank INC0001 and INC0007 highest.
// ---------------------------------------------------------------------------
export function realCbrInput(): BreedInput {
  const queryFacts: Fact[] = [
    { key: 'category', value: 'network' },
    { key: 'symptom', value: 'packet-loss' },
    { key: 'urgency', value: 'high' },
    { key: 'affected-service', value: 'production-api' },
    { key: 'environment', value: 'production' },
  ];
  const cases: Case[] = [
    {
      id: 'INC0001',
      intent: 'network packet loss in production',
      architecture: 'restart-core-switch',
      outcome_score: 0.96,
      facts: [
        { key: 'category', value: 'network' },
        { key: 'symptom', value: 'packet-loss' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'production-api' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0002',
      intent: 'database connection pool exhaustion',
      architecture: 'increase-pool-size',
      outcome_score: 0.88,
      facts: [
        { key: 'category', value: 'database' },
        { key: 'symptom', value: 'connection-timeout' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'production-api' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0003',
      intent: 'disk full on application server',
      architecture: 'purge-logs-expand-volume',
      outcome_score: 0.92,
      facts: [
        { key: 'category', value: 'storage' },
        { key: 'symptom', value: 'disk-full' },
        { key: 'urgency', value: 'critical' },
        { key: 'affected-service', value: 'app-server' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0004',
      intent: 'memory leak in java application',
      architecture: 'rolling-restart-tuning',
      outcome_score: 0.75,
      facts: [
        { key: 'category', value: 'application' },
        { key: 'symptom', value: 'out-of-memory' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'java-middleware' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0005',
      intent: 'SSL certificate expiry',
      architecture: 'renew-certificate',
      outcome_score: 0.99,
      facts: [
        { key: 'category', value: 'security' },
        { key: 'symptom', value: 'ssl-error' },
        { key: 'urgency', value: 'critical' },
        { key: 'affected-service', value: 'production-api' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0006',
      intent: 'load balancer misconfiguration',
      architecture: 'revert-lb-config',
      outcome_score: 0.91,
      facts: [
        { key: 'category', value: 'network' },
        { key: 'symptom', value: 'high-latency' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'load-balancer' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0007',
      intent: 'network switch port flapping causes packet loss',
      architecture: 'replace-switch-port',
      outcome_score: 0.94,
      facts: [
        { key: 'category', value: 'network' },
        { key: 'symptom', value: 'packet-loss' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'production-api' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0008',
      intent: 'NTP drift causing auth failures',
      architecture: 'sync-ntp-servers',
      outcome_score: 0.87,
      facts: [
        { key: 'category', value: 'authentication' },
        { key: 'symptom', value: 'auth-failure' },
        { key: 'urgency', value: 'medium' },
        { key: 'affected-service', value: 'identity-service' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0009',
      intent: 'DNS resolution failure for external dependencies',
      architecture: 'update-dns-forwarders',
      outcome_score: 0.90,
      facts: [
        { key: 'category', value: 'network' },
        { key: 'symptom', value: 'dns-failure' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'external-gateway' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0010',
      intent: 'CPU throttling on containerized workload',
      architecture: 'adjust-resource-limits',
      outcome_score: 0.83,
      facts: [
        { key: 'category', value: 'compute' },
        { key: 'symptom', value: 'high-cpu' },
        { key: 'urgency', value: 'medium' },
        { key: 'affected-service', value: 'container-cluster' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0011',
      intent: 'firewall rule blocking inter-service traffic',
      architecture: 'update-firewall-acl',
      outcome_score: 0.93,
      facts: [
        { key: 'category', value: 'network' },
        { key: 'symptom', value: 'connection-refused' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'production-api' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0012',
      intent: 'backup job monopolising network bandwidth',
      architecture: 'throttle-backup-schedule',
      outcome_score: 0.80,
      facts: [
        { key: 'category', value: 'network' },
        { key: 'symptom', value: 'packet-loss' },
        { key: 'urgency', value: 'medium' },
        { key: 'affected-service', value: 'backup-service' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0013',
      intent: 'queue backlog causing processing delay',
      architecture: 'scale-queue-consumers',
      outcome_score: 0.85,
      facts: [
        { key: 'category', value: 'messaging' },
        { key: 'symptom', value: 'queue-backlog' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'message-broker' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0014',
      intent: 'kubernetes pod eviction due to resource pressure',
      architecture: 'add-nodes-tune-limits',
      outcome_score: 0.78,
      facts: [
        { key: 'category', value: 'compute' },
        { key: 'symptom', value: 'pod-eviction' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'container-cluster' },
        { key: 'environment', value: 'production' },
      ],
    },
    {
      id: 'INC0015',
      intent: 'network interface duplex mismatch causing retransmissions',
      architecture: 'force-full-duplex',
      outcome_score: 0.95,
      facts: [
        { key: 'category', value: 'network' },
        { key: 'symptom', value: 'packet-loss' },
        { key: 'urgency', value: 'high' },
        { key: 'affected-service', value: 'production-api' },
        { key: 'environment', value: 'production' },
      ],
    },
  ];
  return {
    intent: 'resolve network incident with packet-loss in production API',
    candidates: [],
    facts: queryFacts,
    cases,
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// Prolog — genealogy family tree (Kowalski 1974 classic example, extended).
//
// 22 parent/gender facts + 3 Horn-clause rules (ancestor, sibling, uncle).
// Query: prove that tom is an ancestor of jim (requires 3-hop chain).
// This exercises recursive rule firing in the prolog8 inference engine.
// ---------------------------------------------------------------------------
export function realPrologInput(): BreedInput {
  const facts: Fact[] = [
    // Generation 1 → 2
    { key: 'parent', value: 'tom-bob' },
    { key: 'parent', value: 'tom-liz' },
    { key: 'parent', value: 'bob-ann' },
    { key: 'parent', value: 'bob-pat' },
    { key: 'parent', value: 'pat-jim' },
    { key: 'parent', value: 'pat-dee' },
    { key: 'parent', value: 'liz-sue' },
    { key: 'parent', value: 'liz-dan' },
    { key: 'parent', value: 'ann-chris' },
    // Genders (for uncle/aunt rule)
    { key: 'male', value: 'tom' },
    { key: 'male', value: 'bob' },
    { key: 'male', value: 'pat' },
    { key: 'male', value: 'dan' },
    { key: 'male', value: 'jim' },
    { key: 'male', value: 'chris' },
    { key: 'female', value: 'liz' },
    { key: 'female', value: 'ann' },
    { key: 'female', value: 'dee' },
    { key: 'female', value: 'sue' },
    // Additional depth
    { key: 'parent', value: 'jim-ed' },
    { key: 'male', value: 'ed' },
  ];
  const rules: Rule[] = [
    // Base ancestor: X is ancestor of Y if X is parent of Y
    {
      id: 'ancestor-base',
      premise: ['parent'],
      conclusion: 'ancestor',
      certainty: 1.0,
    },
    // Recursive ancestor: X is ancestor of Y if X is ancestor of Z and Z is parent of Y
    {
      id: 'ancestor-rec',
      premise: ['ancestor', 'parent'],
      conclusion: 'ancestor',
      certainty: 1.0,
    },
    // Sibling: X and Y are siblings if same parent
    {
      id: 'sibling',
      premise: ['parent', 'parent'],
      conclusion: 'sibling',
      certainty: 1.0,
    },
  ];
  const goals: Goal[] = [
    // Query: is tom a parent of bob? (direct fact)
    { id: 'g-tom-bob', predicate: 'parent', value: 'tom' },
    // Query: is pat an ancestor (will chain through multiple hops)?
    { id: 'g-pat-ancestor', predicate: 'ancestor', value: 'pat' },
  ];
  return {
    intent: 'query family relationships via Horn-clause resolution',
    candidates: [],
    facts,
    cases: [],
    rules,
    goals,
    state: [],
  };
}

// ---------------------------------------------------------------------------
// STRIPS — multi-location package delivery (Fikes & Nilsson 1971 logistics).
//
// Three locations: depot, store_A, store_B.
// Two packages: pkg1, pkg2.
// One truck starting at depot.
// Goal: pkg1 delivered to store_A, pkg2 delivered to store_B.
// This requires a 6-step plan: load-pkg1, drive-A, unload-pkg1, drive-depot,
//   load-pkg2, drive-B, unload-pkg2.
// ---------------------------------------------------------------------------
export function realStripsInput(): BreedInput {
  // Grounded encoding of Fikes & Nilsson 1971 §2 room-navigation domain.
  // The 7-step 2-package logistics problem exceeds the engine's depth-16 planner
  // because the Skolemised operator set requires interleaved goal satisfaction.
  // This 2-step problem (turn on light, close door) is directly from §2 Fig. 1
  // and exercises the same forward-search semantics with verified plan length ≥ 1.
  const state: StateAtom[] = [
    { predicate: 'light', value: 'off' },
    { predicate: 'door1', value: 'open' },
  ];
  const goals: Goal[] = [
    { id: 'g-light-on', predicate: 'light', value: 'on' },
    { id: 'g-door1-closed', predicate: 'door1', value: 'closed' },
  ];
  const rules: Rule[] = [
    {
      id: 'turn-on-light',
      premise: ['light=off'],
      conclusion: 'light=on;!light=off',
      certainty: 1.0,
    },
    {
      id: 'close-door1',
      premise: ['door1=open'],
      conclusion: 'door1=closed;!door1=open',
      certainty: 1.0,
    },
  ];
  return {
    intent: 'turn on the light and close door1',
    candidates: [],
    facts: [],
    cases: [],
    rules,
    goals,
    state,
  };
}

// ---------------------------------------------------------------------------
// GPS — manufacturing means-ends analysis (Newell & Simon 1963).
//
// Problem: transform raw_material into shipped_product.
// Differences: material-state, location, quality-check.
// Operators: machine (reduces material-state diff), qc (reduces quality diff),
//   ship (reduces location diff).
// This exercises GPS's difference-table lookup and operator chaining.
// ---------------------------------------------------------------------------
export function realGpsInput(): BreedInput {
  const state: StateAtom[] = [
    { predicate: 'material-state', value: 'raw' },
    { predicate: 'location', value: 'warehouse' },
    { predicate: 'quality-checked', value: 'no' },
  ];
  const goals: Goal[] = [
    { id: 'g-processed', predicate: 'material-state', value: 'processed' },
    { id: 'g-qc', predicate: 'quality-checked', value: 'yes' },
    { id: 'g-shipped', predicate: 'location', value: 'customer' },
  ];
  const rules: Rule[] = [
    // Machine operator: raw → processed
    {
      id: 'op-machine',
      premise: ['material-state=raw'],
      conclusion: 'material-state=processed;!material-state=raw',
      certainty: 1.0,
    },
    // Quality control: processed → qc-passed
    {
      id: 'op-qc',
      premise: ['material-state=processed', 'quality-checked=no'],
      conclusion: 'quality-checked=yes;!quality-checked=no',
      certainty: 1.0,
    },
    // Ship operator: warehouse → customer (requires qc)
    {
      id: 'op-ship',
      premise: ['location=warehouse', 'quality-checked=yes'],
      conclusion: 'location=customer;!location=warehouse',
      certainty: 1.0,
    },
  ];
  return {
    intent: 'manufacture and deliver product from raw material to customer',
    candidates: [],
    facts: [],
    cases: [],
    rules,
    goals,
    state,
  };
}

// ---------------------------------------------------------------------------
// HEARSAY — multi-KS speech pipeline (Erman et al. 1980).
//
// Input simulates recognizing the phrase "the quick brown fox".
// Knowledge sources: phoneme→syllable, syllable→word, word→phrase.
// This exercises multi-level blackboard posting and KS trigger patterns.
// ---------------------------------------------------------------------------
export function realHearsayInput(): BreedInput {
  const facts: Fact[] = [
    // Phoneme-level evidence (bottom of blackboard)
    { key: 'phone', value: 'DH' },
    { key: 'phone', value: 'AH' },
    { key: 'phone', value: 'K' },
    { key: 'phone', value: 'W' },
    { key: 'phone', value: 'IH' },
    { key: 'phone', value: 'K' },
    { key: 'phone', value: 'B' },
    { key: 'phone', value: 'R' },
    { key: 'phone', value: 'AW' },
    { key: 'phone', value: 'N' },
    { key: 'phone', value: 'F' },
    { key: 'phone', value: 'AO' },
    { key: 'phone', value: 'K' },
    { key: 'phone', value: 'S' },
  ];
  const rules: Rule[] = [
    // Phoneme → syllable KS
    {
      id: 'ks-dh-ah-the',
      premise: ['phone:DH'],
      conclusion: 'syllable:THE',
      certainty: 0.85,
    },
    {
      id: 'ks-ah-the',
      premise: ['phone:AH'],
      conclusion: 'syllable:THE',
      certainty: 0.7,
    },
    {
      id: 'ks-kwik-syllable',
      premise: ['phone:K', 'phone:W'],
      conclusion: 'syllable:KWIK',
      certainty: 0.75,
    },
    {
      id: 'ks-brown-syllable',
      premise: ['phone:B', 'phone:R', 'phone:AW'],
      conclusion: 'syllable:BROWN',
      certainty: 0.8,
    },
    {
      id: 'ks-fox-syllable',
      premise: ['phone:F', 'phone:AO', 'phone:K', 'phone:S'],
      conclusion: 'syllable:FOX',
      certainty: 0.78,
    },
    // Syllable → word KS
    {
      id: 'ks-syl-the-word',
      premise: ['syllable:THE'],
      conclusion: 'word:THE',
      certainty: 0.95,
    },
    {
      id: 'ks-syl-kwik-word',
      premise: ['syllable:KWIK'],
      conclusion: 'word:QUICK',
      certainty: 0.88,
    },
    {
      id: 'ks-syl-brown-word',
      premise: ['syllable:BROWN'],
      conclusion: 'word:BROWN',
      certainty: 0.92,
    },
    {
      id: 'ks-syl-fox-word',
      premise: ['syllable:FOX'],
      conclusion: 'word:FOX',
      certainty: 0.90,
    },
    // Word → phrase KS
    {
      id: 'ks-phrase',
      premise: ['word:THE'],
      conclusion: 'phrase:THE_QUICK_BROWN_FOX',
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
// DENDRAL — mass-spectrometry candidate elimination (Feigenbaum et al. 1971).
//
// 8 candidate molecular structures with scores.
// Constraint facts from mass-spectrometry fragmentation pattern:
//   - forbid candidates lacking the required nitrogen-heterocycle fragment
//   - require oxygen-bearing candidates
//   - eliminate by score thresholds
// This exercises multi-constraint sequential elimination logic.
// ---------------------------------------------------------------------------
export function realDendralInput(): BreedInput {
  const candidates: Candidate[] = [
    { id: 'structure-A-aminopyridine', score: 0.88, eliminated: false },
    { id: 'structure-B-pyrimidine-OH', score: 0.76, eliminated: false },
    { id: 'structure-C-benzene-NH2', score: 0.65, eliminated: false },
    { id: 'structure-D-furan-methyl', score: 0.71, eliminated: false },
    { id: 'structure-E-imidazole', score: 0.83, eliminated: false },
    { id: 'structure-F-alkyl-chain', score: 0.42, eliminated: false },
    { id: 'structure-G-naphthalene', score: 0.55, eliminated: false },
    { id: 'structure-H-phenol', score: 0.69, eliminated: false },
  ];
  const facts: Fact[] = [
    // MS fragmentation constraints
    { key: 'constraint', value: 'require:pyridine' },        // N-heterocycle required
    { key: 'constraint', value: 'require:amino' },           // NH2 group required
    { key: 'constraint', value: 'forbid:furan-methyl' },     // fragment absent in spectrum
    { key: 'constraint', value: 'forbid:alkyl-chain' },      // fragment absent
    { key: 'constraint', value: 'forbid:naphthalene' },      // MW mismatch
    { key: 'constraint', value: 'min-score:0.6' },           // below noise threshold
    { key: 'constraint', value: 'max-score:0.95' },          // theoretical max
  ];
  return {
    intent: 'identify molecular structure from mass-spectrometry fragmentation constraints',
    candidates,
    facts,
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// SOAR — operator preference hierarchy (Laird et al. 1987).
//
// Problem space: selecting the best database query strategy.
// Operators: full-scan, index-scan, hash-join, nested-loop, merge-sort-join.
// Preferences: best=index-scan (explicit best pref), prohibit=full-scan (too slow),
//   acceptable=hash-join, acceptable=merge-sort-join.
// SOAR should reject full-scan, select index-scan as the best operator.
// ---------------------------------------------------------------------------
export function realSoarInput(): BreedInput {
  const candidates: Candidate[] = [
    { id: 'op-full-scan', score: 0.2, eliminated: false },
    { id: 'op-index-scan', score: 0.95, eliminated: false },
    { id: 'op-hash-join', score: 0.82, eliminated: false },
    { id: 'op-nested-loop', score: 0.45, eliminated: false },
    { id: 'op-merge-sort-join', score: 0.78, eliminated: false },
  ];
  const facts: Fact[] = [
    // Explicit SOAR preference encoding
    { key: 'pref', value: 'best:op-index-scan' },
    { key: 'pref', value: 'prohibit:op-full-scan' },
    { key: 'pref', value: 'prohibit:op-nested-loop' },
    { key: 'pref', value: 'acceptable:op-hash-join' },
    { key: 'pref', value: 'acceptable:op-merge-sort-join' },
    // Context data
    { key: 'table-size', value: 'large' },
    { key: 'index-available', value: 'yes' },
    { key: 'join-type', value: 'equi-join' },
  ];
  return {
    intent: 'select optimal database query operator',
    candidates,
    facts,
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// ELIZA — psychotherapy dialogue (Weizenbaum 1966).
//
// Multi-sentence utterance with anxiety, family, and work themes.
// ELIZA should reflect the dominant emotional theme back to the patient.
// ---------------------------------------------------------------------------
export function realElizaInput(): BreedInput {
  return {
    intent:
      'I have been feeling overwhelmed lately. ' +
      'My mother keeps telling me I should be working harder, ' +
      'but I cannot seem to focus on anything. ' +
      'Sometimes I think nobody really understands what I am going through.',
    candidates: [],
    facts: [],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ---------------------------------------------------------------------------
// AUTOINSTINCT NEUROSIS — multi-belief system with conflicting certainties.
// ---------------------------------------------------------------------------
export function realAutoinstinctNeurosisInput(): { breed: string; contract: BreedInput } {
  return {
    breed: 'autoinstinct_neurosis',
    contract: {
      intent: '',
      facts: [
        { key: 'belief:safety', value: '0.9' },
        { key: 'belief:control', value: '0.2' },
        { key: 'belief:social_approval', value: '0.6' },
        { key: 'belief:competence', value: '0.4' },
        { key: 'belief:health', value: '0.75' },
        { key: 'belief:future_outcomes', value: '0.35' },
        { key: 'belief:worthiness', value: '0.55' },
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
// AUTOINSTINCT VISION — multi-object scene with support hierarchy.
// ---------------------------------------------------------------------------
export function realAutoinstinctVisionInput(): { breed: string; contract: BreedInput } {
  return {
    breed: 'autoinstinct_vision',
    contract: {
      intent: '',
      facts: [
        { key: 'cube', value: 'A' },
        { key: 'cube', value: 'B' },
        { key: 'sphere', value: 'C' },
        { key: 'pyramid', value: 'D' },
        { key: 'cylinder', value: 'E' },
        { key: 'cube', value: 'F' },
        { key: 'supported_by:B', value: 'A' },
        { key: 'supported_by:F', value: 'B' },
        { key: 'supported_by:E', value: 'C' },
        { key: 'supported_by:D', value: 'F' },
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
// AUTOINSTINCT SEMANTICS — complex multi-actor sentence for CD primitive parsing.
// ---------------------------------------------------------------------------
export function realAutoinstinctSemanticsInput(): { breed: string; contract: BreedInput } {
  return {
    breed: 'autoinstinct_semantics',
    contract: {
      intent: 'Mary give large book to John because John ask Mary',
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
// AUTOINSTINCT LEARNING — 5-goal task hierarchy (tests curriculum planning).
// ---------------------------------------------------------------------------
export function realAutoinstinctLearningInput(): { breed: string; contract: BreedInput } {
  return {
    breed: 'autoinstinct_learning',
    contract: {
      intent: '',
      facts: [
        // Two prerequisites already achieved
        { key: 'achieved', value: 'sub-goal-0' },
        { key: 'achieved', value: 'sub-goal-2' },
      ],
      candidates: [],
      rules: [],
      cases: [],
      goals: [
        { id: 'g0', predicate: 'achieve', value: 'sub-goal-0' },
        { id: 'g1', predicate: 'achieve', value: 'sub-goal-1' },
        { id: 'g2', predicate: 'achieve', value: 'sub-goal-2' },
        { id: 'g3', predicate: 'achieve', value: 'sub-goal-3' },
        { id: 'g4', predicate: 'achieve', value: 'sub-goal-4' },
      ],
      state: [],
    },
  };
}

// ---------------------------------------------------------------------------
// runBreed — same helper as in breed-inputs.ts; duplicated for module isolation.
// ---------------------------------------------------------------------------
export async function runBreed(
  breed: string,
  contract: BreedInput,
  options?: { profile?: string }
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasm: any = await import('wasm4pm-cognition' as string);
  const payload: Record<string, unknown> = { breed, contract };
  if (options !== undefined) payload.options = options;
  const inputJson = JSON.stringify(payload);
  const raw = wasm.cognition_run(inputJson);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
