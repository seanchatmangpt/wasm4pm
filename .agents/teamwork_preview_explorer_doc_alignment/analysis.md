# Doc Alignment Analysis — v26.6.10

This report details the investigation into old-AI cognition breeds, value-level oracles, adversaries, release details, and alignment recommendations for `wasm4pm`.

---

## 1. Executive Summary

- **Total defined breeds:** 52 breeds are defined in `crates/wasm4pm-cognition/src/breeds/mod.rs` (via `BreedId` enum) and mapped to the TS Zod schema in `packages/cognition/src/schemas.ts`. 3 additional breeds are defined as `UNSUPPORTED` in the registry (`morphological`, `triz`, `ocpm_route_discoverer`), making a total of 55 registered algorithms/breeds.
- **Implemented / Admitted breeds (13-corpus):** 13 classic and autonomic breeds are fully certified/admitted in `VALIDATED_BREEDS` (BVC score = 1.0).
- **Remaining / PARTIAL_ALIVE breeds (39-corpus):** 39 modern breeds are implemented, tested, and have OCPN models, but are not yet certified in the static TS whitelist `bvc.ts` (BVC score = 0.25).
- **Oracle / Adversary parity:** All 52 breeds have a defined `BreedOracle` and `BreedAdversary` (Cheat*) implemented in Rust and tested.
- **v26.6.10 details:** Release version `26.6.10`, git commit `7a18553d4cbde7d842c7e2474563779a1ddd9ee0`, package `wasm4pm@26.6.10`. All 365 TS integration tests and 319 Rust tests pass.

---

## 2. The 39 Implemented/Admitted Breeds (PARTIAL_ALIVE status)

These 39 breeds are implemented in Rust, route via `dispatch.rs`, and are tested in the periodic integration tests (`periodic-1` to `periodic-4` and main integration test), but are currently `PARTIAL_ALIVE` because they are not yet certified in `packages/cognition/src/bvc.ts`:

1. `act_r`
2. `allen_temporal`
3. `analogy_sme`
4. `bayesian_network`
5. `belief_merging`
6. `circumscription`
7. `clp`
8. `csp_ac3`
9. `ctl_check`
10. `episodic_memory`
11. `event_calculus`
12. `fuzzy_logic`
13. `ilp`
14. `ltl_monitor`
15. `mdp`
16. `naive_physics`
17. `partial_order_plan`
18. `problog`
19. `qualitative_reason`
20. `rl_symbolic`
21. `sat_cdcl`
22. `script_sam`
23. `situation_calculus`
24. `version_space`
25. `htn_planning`
26. `default_logic`
27. `dempster_shafer`
28. `frames_inheritance`
29. `ebl`
30. `asp`
31. `description_logic`
32. `abductive_lp`
33. `abductive_ibe`
34. `tableaux`
35. `construction_grammar`
36. `markov_logic`
37. `pomdp`
38. `contingent_plan`
39. `meta_reasoning`

---

## 3. The Remaining 13 Breeds (ADMITTED / Whitelisted status)

These 13 breeds are the classic and autonomic breeds that are fully certified in `packages/cognition/src/bvc.ts` `VALIDATED_BREEDS`:

1. `eliza` (Dialogue/Frame)
2. `cbr` (Case-Based Reasoning)
3. `dendral` (Hypothesis Enumeration)
4. `strips` (State-Space Planning)
5. `prolog` (Logic Programming)
6. `mycin` (Rule-Based Expert System)
7. `gps` (General Problem Solver)
8. `soar` (Cognitive Architecture)
9. `hearsay` (Blackboard Consensus)
10. `autoinstinct_neurosis` (Autonomic Neurosis)
11. `autoinstinct_semantics` (Autonomic Semantics)
12. `autoinstinct_vision` (Autonomic Vision)
13. `autoinstinct_learning` (Autonomic Learning)

---

## 4. Value-Level Oracles & Adversaries (52 of each)

All 52 breeds have a corresponding `BreedOracle` and `BreedAdversary` (Cheat*) implementation in Rust:

### Location of Definitions
They are implemented in `crates/wasm4pm-cognition/src/breeds/support/oracle_impls/` across 5 modules:
1. `dialogue.rs` (8 pairs): Eliza, Dendral, Hearsay, ConstructionGrammar, AutoinstinctLearning, AutoinstinctSemantics, AutoinstinctNeurosis, AutoinstinctVision.
2. `learning.rs` (10 pairs): Cbr, Ilp, Ebl, VersionSpace, AnalogySme, EpisodicMemory, ScriptSam, QualitativeReason, NaivePhysics, MetaReasoning.
3. `logic.rs` (12 pairs): SatCdcl, Tableaux, CtlCheck, LtlMonitor, DescriptionLogic, Circumscription, BeliefMerging, AbductiveLp, AbductiveIbe, Problog, Clp, AllenTemporal.
4. `planning.rs` (12 pairs): Strips, Gps, HtnPlanning, PartialOrderPlan, ContingentPlan, EventCalculus, SituationCalculus, Soar, ActR, RlSymbolic, Pomdp, MarkovLogic.
5. `rule_fact.rs` (10 pairs): Mycin, Prolog, FuzzyLogic, DempsterShafer, CspAc3, DefaultLogic, FramesInheritance, Asp, Mdp, BayesianNetwork.

### How they are Tested
- **Rust Unit Tests:** Tested inline via `run_adversary_check::<Cheat*>()` (defined in `oracle.rs`) in each of the 5 modules.
- **Rust Integration Tests:** Tested in `crates/wasm4pm-cognition/tests/breed_adversarial.rs` and `breed_oracle_gaps.rs`.
- **TypeScript Integration Tests:** Tested in `packages/cognition/src/__tests__/` across the `cognition-breeds.integration.test.ts` and `cognition-breeds-periodic-{1,2,3,4}.integration.test.ts` files, verifying Rank-1 to Rank-4 behaviors.

---

## 5. Version v26.6.10 Details

- **Package Identity:** `wasm4pm@26.6.10` (from `packages/kernel/package.json`)
- **Root Monorepo Version:** `26.6.10`
- **Git Commit Hash:** `7a18553d4cbde7d842c7e2474563779a1ddd9ee0` (release certificate embeds `eceacfcb43d58b230f109ecc553be55a186d2784`)
- **WASM Bundle Hash:** `d4bc2f407d37fcb6ca0fceee4ed3b54f0fb95092b3f4a4872a562624f1163597`
- **Tarball Integrity:** `sha512-A6g+gOqYsdJFBoaiB/fxTTX+cz7BTwng6W9Z2i9fDN8FLC+wLD3mGQ5SRnh/0Zjt9Qqm4D92ZJZn0bePwCaTpw==`

---

## 6. Verification Results

- **Rust Tests (`cargo test --lib --workspace`):** `319 passed; 0 failed`.
- **TS Tests (`pnpm vitest run packages/cognition/src/__tests__/`):** `365 passed; 0 failed` across 21 test files.
- **Check Docs Script (`node check_docs.js`):** Ran successfully with no output (meaning all 33 listed breeds have a corresponding documentation file in `docs/breeds/`).

---

## 7. Exact Recommendations for Document/Script Alignment

### A. `README.md`
- **Change:** Update line 3 and line 107 to reflect the new total of **52 Old-AI cognition breeds** instead of 13.
- **Proposed Diff:**
```diff
- High-performance process mining in Rust/WebAssembly — 60 discovery and analysis algorithms, native OCEL 2.0 support, and 13 Old-AI cognition breeds — all through one CLI (`wpm`).
+ High-performance process mining in Rust/WebAssembly — 60 discovery and analysis algorithms, native OCEL 2.0 support, and 52 Old-AI cognition breeds — all through one CLI (`wpm`).
```
```diff
- ## Cognition (Old AI)
- 
- Thirteen breeds run natively in Rust and are exposed through `wpm cognition`. Nine are classic Old-AI paradigms; four are Autoinstinct breeds:
+ ## Cognition (Old AI)
+ 
+ Fifty-two breeds run natively in Rust and are exposed through `wpm cognition`. Thirteen are certified/admitted under BVC; thirty-nine are fully implemented under PARTIAL_ALIVE status:
```

### B. `docs/registry/certified-breeds-2026-06.md`
- **Change:** Expand lists to include all 52 implemented breeds, updating their status to `PARTIAL_ALIVE` or `ADMITTED` accordingly.
- **Proposed Diff:**
  - Update **Registry totals** from `13 implemented (13 ADMITTED, 0 PARTIAL_ALIVE) | 9 UNSUPPORTED | 22 total defined` to `52 implemented (13 ADMITTED, 39 PARTIAL_ALIVE) | 3 UNSUPPORTED | 55 total defined`.
  - Add tables for the 39 newly implemented breeds.

### C. `docs/implementation-status.md`
- **Change:** Update Gate G4 (OCEL Gate) and Workstream D (OCEL L1) status to reflect that all 52 breeds now have L0 + L1 spans, OCPN models on disk, and fitness replay at 1.0.
- **Proposed Diff:**
```diff
- | G4 | OCEL Gate | ADMITTED | L0 + L1 spans in all 13 breeds; 13 OCPN models in `ocel/models/l1/`; `validate_ocel_alignment()` native DFA replay at fitness=1.0 for all 13 breeds (bc998553) | None |
+ | G4 | OCEL Gate | ADMITTED | L0 + L1 spans in all 52 breeds; 52 OCPN models in `ocel/models/l1/`; `validate_ocel_alignment()` native DFA replay at fitness=1.0 for all 52 breeds | None |
```
```diff
- | WS | Name | Status | Evidence Present | Named Gaps |
- |----|------|--------|-----------------|------------|
- | D | OCEL L1 | ADMITTED | L0 + L1 spans in all 13 breeds; 13 OCPN models in `ocel/models/l1/`; native DFA replay fitness=1.0 for all 13 breeds (bc998553) | None |
+ | D | OCEL L1 | ADMITTED | L0 + L1 spans in all 52 breeds; 52 OCPN models in `ocel/models/l1/`; native DFA replay fitness=1.0 for all 52 breeds | None |
```

### D. `docs/breeds/*`
- **Change:** Ensure all 52 breed markdown files are kept up to date and correct any reference to "UNSUPPORTED" or "No implementation" in the 39 newly implemented breed documents (e.g. `bayesian_network.md`, `fuzzy_logic.md`, etc.). Since they are now implemented in Rust and have full test coverage, their documentation should reflect this active/implemented status.

### E. `check_docs.js`
- **Change:** Add the remaining 19 breeds to the array of breeds checked by the script to prevent missing documentation files from going unnoticed in the future.
- **Proposed Content for `check_docs.js`:**
```javascript
const fs = require('fs');

const breeds = [
    // The 33 previously listed breeds
    "ltl_monitor", "allen_temporal", "fuzzy_logic", "bayesian_network", "csp_ac3", "default_logic",
    "htn_planning", "dempster_shafer", "frames_inheritance", "ebl",
    "asp", "description_logic", "abductive_lp", "abductive_ibe", "partial_order_plan", "event_calculus",
    "mdp", "version_space", "belief_merging", "qualitative_reason", "script_sam", "clp",
    "situation_calculus", "circumscription", "analogy_sme", "act_r", "problog", "sat_cdcl",
    "episodic_memory", "rl_symbolic", "ctl_check", "ilp", "naive_physics",
    // The 13 classic/autoinstinct breeds
    "eliza", "cbr", "dendral", "strips", "prolog", "mycin", "gps", "soar", "hearsay",
    "autoinstinct_neurosis", "autoinstinct_semantics", "autoinstinct_vision", "autoinstinct_learning",
    // The 6 new breeds
    "tableaux", "construction_grammar", "markov_logic", "pomdp", "contingent_plan", "meta_reasoning"
];

for (const breed of breeds) {
  if (!fs.existsSync(`docs/breeds/${breed}.md`)) {
    console.log(`Missing docs for ${breed}`);
  }
}
```
