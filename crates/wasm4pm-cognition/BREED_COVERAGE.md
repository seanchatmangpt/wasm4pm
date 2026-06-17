# Cognitive Breed Coverage — wasm4pm-cognition

**Total Breeds:** 9 (all real implementations, no stubs)
**Last Updated:** 2026-06-17
**Version:** v26.6.26

Every breed below is a real algorithm implementing the `CognitionBreed` trait
(`id`, `capabilities`, `preconditions`, `run`, `postconditions`, `receipt`) and is
wired into both the WASM dispatch (`src/wasm.rs`) and the test dispatch
(`src/breeds/mod.rs`). There are no string-dispatch stubs.

---

## Implemented Breeds (9 Total)

| # | Breed | `BreedId` | Paradigm | Reference |
|---|-------|-----------|----------|-----------|
| 1 | ELIZA | `Eliza` | Pattern-matching dialogue with slot filling | Weizenbaum 1966 |
| 2 | CBR | `Cbr` | Case-based reasoning via Jaccard similarity | Schank 1983 |
| 3 | MYCIN | `Mycin` | Forward-chaining rules with certainty factors | Shortliffe 1976 |
| 4 | DENDRAL | `Dendral` | Constraint-based candidate enumeration | Feigenbaum 1971 |
| 5 | STRIPS | `Strips` | Precondition/effect state-space planning | Fikes & Nilsson 1971 |
| 6 | Prolog | `Prolog` | Horn-clause backward chaining | Robinson 1965 |
| 7 | GPS | `Gps` | Means-ends gap reduction | Newell & Shaw 1963 |
| 8 | SOAR | `Soar` | Preference-based operator selection | Laird 1987 |
| 9 | HEARSAY-II | `Hearsay` | Blackboard consensus fusion | Erman & Lesser 1980 |

### 1. ELIZA (`Eliza`)
- **Source:** `src/breeds/frame.rs`
- **Description:** Pattern-matching dialogue with slot filling for open-ended intent reflection.
- **Output:** Conversational response plus scored candidates.
- **Active in Modes:** Full, Reduced, Minimal, Emergency.

### 2. CBR — Case-Based Reasoning (`Cbr`)
- **Source:** `src/breeds/cbr.rs`
- **Description:** Retrieves and adapts past cases by Jaccard similarity on fact sets.
- **Output:** Similar cases, adapted recommendation, similarity trace.
- **Active in Modes:** Full, Reduced, Minimal.

### 3. MYCIN (`Mycin`)
- **Source:** `src/breeds/production_rules.rs`
- **Description:** Forward-chaining rule engine combining certainty factors.
- **Output:** Diagnosis candidates, confidence scores, fired-rule explanation chain.
- **Active in Modes:** Full, Reduced, Minimal.

### 4. DENDRAL (`Dendral`)
- **Source:** `src/breeds/dendral.rs`
- **Description:** Enumerates candidate structures and prunes them by constraints.
- **Output:** Candidate structures, ranking, elimination reasons.
- **Active in Modes:** Full only.

### 5. STRIPS (`Strips`)
- **Source:** `src/breeds/strips.rs`
- **Description:** State-space planning with preconditions and effects.
- **Output:** Action sequence and plan decomposition.
- **Active in Modes:** Full, Reduced.

### 6. Prolog (`Prolog`)
- **Source:** `src/breeds/prolog.rs`
- **Description:** Horn-clause backward chaining with backtracking search.
- **Output:** Query solutions and proof traces.
- **Active in Modes:** Full, Reduced.

### 7. GPS — General Problem Solver (`Gps`)
- **Source:** `src/breeds/gps.rs`
- **Description:** Means-ends analysis reducing the gap to a goal state.
- **Output:** Solution path and operator sequence.
- **Active in Modes:** Full only.

### 8. SOAR (`Soar`)
- **Source:** `src/breeds/soar.rs`
- **Description:** Preference-based operator selection over a problem space.
- **Output:** Decision, elaboration candidates, selection trace.
- **Active in Modes:** Full only.

### 9. HEARSAY-II (`Hearsay`)
- **Source:** `src/breeds/hearsay.rs`
- **Description:** Blackboard architecture fusing knowledge-source hypotheses by consensus.
- **Output:** Best hypothesis, confidence, contribution trace.
- **Active in Modes:** Full only.

---

## Degradation Modes

The cognitive system supports graceful degradation under resource and health constraints.

| Mode | Active Breeds | Trigger | Use Case |
|------|---------------|---------|----------|
| **Full** | All 9 breeds | Normal operation | Full breed selection |
| **Reduced** | ELIZA, CBR, Mycin, Prolog, Strips | Memory pressure, response time exceeded, moderate error rate | Degraded but responsive processing |
| **Minimal** | ELIZA, CBR, Mycin | Critical memory, high error rate, high response latency | Essential processing only |
| **Emergency** | ELIZA only | Health level 3+, system near failure | Fallback conversational response |

---

## Registry Statistics

| Metric | Value |
|--------|-------|
| **Total Breeds** | 9 (all real implementations) |
| **String-dispatch stubs** | 0 |
| **Inference Trace Required** | Yes (FM-5 fraud detection) |
| **Max Inference Steps** | 10,000 (MAX_TRACE_STEPS) |
| **Max Candidates** | 1,000 |
| **Max Facts** | 10,000 |

---

## Test Coverage Summary

### Breed Quality Tests
- All 9 `BreedId` variants covered.
- Output structure validation (explanation, candidates, inference trace).
- Inference trace monotonicity enforcement.
- Score bounds validation [0.0, 1.0].
- Elimination reason validation.
- FM-5 fraud detection (empty trace → penalty).

### Autonomic Healing Tests
- `AutonomicContext` construction and boundaries.
- `BreedRewardSignal` computation.
- `compute_breed_reward` across scenarios.
- `prioritize_breeds` health-based selection.
- `enrich_input_with_context`.
- `aggregate_rewards` multi-breed scenarios.
- `breed_id_from_str` conversions (case-insensitive).

### Production Hardening Tests
- `DegradationMode` construction (Full, Reduced, Minimal, Emergency).
- `DegradationTrigger` boundary values.
- `select_degradation_mode` logic across health levels.
- `breeds_for_mode` breed-list validation.
- `breed_active_in_mode` correctness.
- `mode_rationale` documentation accuracy.
- `recovery_recommendation` text validation.
- Mode severity ordering.

---

**Registry Notes:** The cognition layer ships 9 real breed implementations spanning
dialogue, case-based reasoning, rule systems, constraint enumeration, planning, logic
programming, means-ends search, unified cognitive architecture, and blackboard
consensus. Each is dispatched and tested; none are stubs.
