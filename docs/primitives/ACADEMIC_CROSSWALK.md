# Primitive Academic Crosswalk — wasm4pm

Cross-reference: each primitive doc → paper grounding → formal object → implementation → tests.

**Source of truth:** `../academic_coverage.toml`  
**Primitive count:** 10 (primitives 00–09)  
**Gate:** ACADEMIC-COVERAGE-001 (status: `partial` — see gap section below)

---

## Reading this table

| Column | Meaning |
|---|---|
| Primitive | Link to docs file |
| Paper(s) | Canonical academic grounding, or `(engineering)` if no PM paper defines the primitive |
| Formal Object | What the paper defines / what the primitive implements |
| Definitions | Specific defs / theorems from the paper(s) that serve as test oracles |
| Implementation | Rust / TypeScript source file(s) |
| Positive Tests | Test file(s) with paper-grounded oracles |
| Negative Fixture | File that must be **rejected** by the system |
| Status | `covered` / `partial` / `planned` |

**Coverage kinds:**
- `direct` — implementation directly realises the paper's formal definition
- `derived` — implementation adapts a paper result (explicitly noted where differing)
- `engineering` — no canonical PM paper; implemented as a sound engineering primitive
- `consumer-contract` — implements an external standard (ISO, OMG, IEEE), not a PM paper

---

## Crosswalk Table

| Primitive | Paper(s) | Formal Object | Definitions | Implementation | Positive Tests | Negative Fixture | Status |
|---|---|---|---|---|---|---|---|
| [00 — Inventory](00-WASM4PM-PRIMITIVE-INVENTORY.md) | (engineering) | Kernel registry catalogue (63 algorithm entries across 10 categories) | — | `packages/kernel/src/registry.ts` | — | — | **covered** |
| [01 — OCEL v2](01-OCEL-V2-PRIMITIVES.md) | Ghahfarokhi et al. ICPM 2021; van der Aalst ATAED 2019 | Object-Centric Event Log v2.0: objects, events, E2O relations, O2O relations | OCEL 2.0 standard objects / events / relations model | `wasm4pm/src/ocel_io.rs`, `wasm4pm/src/ocel_flatten.rs` | `wasm4pm/tests/ocel_real_data_tests.rs`, `wasm4pm/tests/ocel_object_centric_audit.rs` | `fixtures/ocpq/invalid_o2o.json` | **covered** |
| [02 — POWL 2.0](02-POWL-2-PRIMITIVES.md) | Kourani & van der Aalst CEUR-WS 3783 (2024); Kourani, Park & van der Aalst arXiv:2602.15739v3 | Partial-Order Workflow Language 2.0 with choice graphs (POWL 2.0); MineDG (Def 5) | Def 5 (MineDG correctness), choice-graph semantics | `wasm4pm/src/wf_to_powl.rs`, `wasm4pm/src/powl_to_process_tree.rs` | `wasm4pm/tests/choice_graph_paper.rs`, `wasm4pm/tests/minedg_choice_graph_test.rs`, `wasm4pm/tests/adversarial_powl_tests.rs` | — | **covered** |
| [03 — WF-net](03-WFNET-PETRI-PRIMITIVES.md) | Kourani, Park & van der Aalst arXiv:2602.15739v3; van der Aalst *Process Mining* (2016) | WF-net soundness, free-choice, state machine, marked graph predicates (Defs 3.1–3.13, Thm 1) | Def 3.3 (WF-net), Def 3.4 (free-choice), Def 3.5 (soundness), Def 3.10 (state machine), Def 3.11 (marked graph), Thm 1 (separability) | `wasm4pm/src/soundness.rs`, `wasm4pm/src/wf_to_powl.rs` | `wasm4pm/tests/adversarial_powl_tests.rs` | `fixtures/conformance/ggen_invalid_exclusion.json` | **covered** |
| [04 — Conformance](04-CONFORMANCE-PRIMITIVES.md) | Rozinat & van der Aalst *IS* 2008; van der Aalst et al. WIRES DMKD 2012; Munoz-Gama & Carmona ICATPN 2010; Adriansyah PhD 2014 | Token-replay fitness and alignment-based conformance (two-tier: diagnostic ≥0.8, admission =1.0) | Token-replay formula: `fitness = 1 − (missing + consumed) / (produced + remaining)`; Adriansyah optimal alignment cost | `wasm4pm/src/conformance.rs`, `wasm4pm/src/alignments.rs` | `wasm4pm/tests/conformance_model_truth_gaps.rs`, `wasm4pm/tests/ground_truth_conformance_tests.rs`, `wasm4pm/tests/self_conformance_tests.rs` | `fixtures/conformance/ggen_invalid_exclusion.json`, `fixtures/conformance/ggen_invalid_precedence.json` | **covered** |
| [05 — Process World Foundry](05-PROCESS-WORLD-FOUNDRY.md) | (engineering) | Synthetic but lawful process world generation via stochastic Petri net playout | — | `wasm4pm/src/playout.rs` | — | — | **partial** |
| [06 — Negative Corpus](06-NEGATIVE-CORPUS.md) | (engineering) | Negative fixture corpus for refusal proof (invalid OCEL, invalid XES, impossible traces) | — | (fixtures only — no Rust module) | `wasm4pm/tests/negative_quality.rs`, `wasm4pm/tests/adversarial_ingestion.rs`, `wasm4pm/tests/anti_fake_tests.rs` | `fixtures/conformance/ggen_invalid_exclusion.json`, `fixtures/conformance/ggen_invalid_immediate.json`, `fixtures/conformance/ggen_invalid_precedence.json`, `fixtures/ocpq/invalid_monotonicity.json`, `fixtures/ocpq/invalid_o2o.json` | **covered** |
| [07 — Route-Driven TDD](07-ROUTE-DRIVEN-TDD.md) | (engineering) | POWL 2.0 route-driven test substrate (15 named routes; choice\_graph / sequence / partial\_order) | — | `wasm4pm/src/testing/` (PowlTestHarness, ConformanceVerdict, AndonPull, ProofPackWriter) | — | — | **covered** |
| [08 — Benchmark Gates](08-BENCHMARK-GATES.md) | (engineering) | Deterministic benchmark gates G1–G5 with BLAKE3 receipts and CalVer version locks | G1 determinism; G2 receipt integrity; G3 quality threshold (fitness ≥ 0.95, precision ≥ 0.80); G4 cross-profile synchrony; G5 report completeness | `wasm4pm/src/benchmark_runner.rs`, `wasm4pm/src/benchmark_registry.rs` | `wasm4pm/benches/closed_claw/gates.rs` | — | **covered** |
| 09 — OCPQ *(doc planned)* | Küsters & van der Aalst arXiv:2506.11541v1 | Object-Centric Process Querying: E2O, O2O, TBE predicates, CHILD SET constraints (Defs 1–9) | Defs 1–9 (OCPQ formal language) | *(not yet implemented — `crates/ocpq/` not present)* | *(none)* | `fixtures/ocpq/invalid_monotonicity.json`, `fixtures/ocpq/invalid_o2o.json` | **planned** |

---

## The Gold Standard: WF-net Primitive (03)

The WF-net primitive row is cited as the gold standard for this project's academic test coverage
because it satisfies all five properties required for `covered` status:

1. **Paper-grounded formal object.** The implementation maps to a named set of definitions and a
   theorem (Defs 3.1–3.13, Theorem 1) from a specific arXiv preprint. The oracle is the mathematical
   definition, not the implementation output — eliminating FM-5 self-reference risk.

2. **Implementation that directly realises the formal object.** `soundness.rs` implements the
   predicate functions (is\_workflow\_net, is\_free\_choice, is\_sound, etc.) named in the paper.
   `wf_to_powl.rs` realises the POWL conversion algorithm proven in Theorem 1.

3. **Positive tests that cite their paper definitions by name.**
   From `wasm4pm/tests/wf_soundness.rs`:
   - `def_3_3_seq_is_workflow_net` — verifies Def 3.3 (a net with unique source/sink is a WF-net)
   - `def_3_5_sequence_is_sound_and_safe` — verifies soundness per Def 3.5
   - `def_3_10_seq_is_state_machine` — verifies the state-machine predicate Def 3.10
   - `def_3_11_seq_is_marked_graph` — verifies the marked-graph predicate Def 3.11
   - (17 tests total, each name encodes its paper definition)

4. **Negative fixture that must be rejected.** `fixtures/conformance/ggen_invalid_exclusion.json`
   contains an exclusion-constraint violation — the system must reject this input rather than
   silently assign a fitness score.

5. **Clear known limits.** The TOML record honestly notes that `wf_to_powl.rs` was referenced
   as planned in the POWL primitive doc at the time of this writing, and that `soundness.rs` is
   the primary implementation surface.

---

## Pattern: Test names as paper citations

The naming convention in `wasm4pm/tests/wf_soundness.rs` is the **highest academic test coverage
standard** in this codebase:

```
def_3_3_seq_is_workflow_net        →  Def 3.3 of Kourani, Park & van der Aalst (arXiv:2602.15739v3)
def_3_5_sequence_is_sound_and_safe →  Def 3.5  (soundness)
def_3_10_seq_is_state_machine      →  Def 3.10 (state machine predicate)
def_3_11_seq_is_marked_graph       →  Def 3.11 (marked graph predicate)
```

Each test name is a citable pointer into the paper. An auditor can read the test name, open the
paper at the named definition, re-derive the expected value by hand, and verify the oracle without
reading any implementation code. This breaks FM-5 self-reference: the oracle is the theorem, not
the code.

**Primitives that should replicate this pattern:**

| Primitive | Paper target | Definitions to cite in test names |
|---|---|---|
| 01 — OCEL v2 | OCEL 2.0 Standard / Ghahfarokhi et al. | E2O relation validity, O2O cardinality, OCEL well-formedness |
| 02 — POWL 2.0 | Kourani & van der Aalst CEUR-WS 3783 | Def 5 (MineDG), choice-graph semantics |
| 04 — Conformance | Rozinat & van der Aalst 2008 | Token-replay formula, alignment cost function |
| 09 — OCPQ | Küsters & van der Aalst arXiv:2506.11541v1 | Defs 1–9 (E2O, O2O, TBE, CHILD SET) |

---

## Gaps in Primitive Coverage

### Status = `partial`

| Primitive | Gap | Remediation |
|---|---|---|
| **05 — Process World Foundry** | No end-to-end world-spec DSL; playout module exists but coordinated generation (OCEL + POWL + WF-net + negative trace from one spec) is not wired. No positive tests that assert world-level properties. `playout.rs` uses global unseeded `fastrand` — non-deterministic (see `DETERMINISM_AUDIT.md`). | Wire world-spec DSL → OCEL + POWL + playout pipeline. Fix `fastrand` seeding. Add at least one test that asserts generated log conforms to the generating model with fitness = 1.0. |

### Status = `planned`

| Primitive | Gap | Remediation |
|---|---|---|
| **09 — OCPQ** | No `docs/primitives/09-OCPQ-PRIMITIVES.md`. No `crates/ocpq/` in worktree. Negative fixtures (`invalid_monotonicity.json`, `invalid_o2o.json`) exist but nothing currently reads them. Defs 1–9 of Küsters & van der Aalst are identified but not implemented. | Create `09-OCPQ-PRIMITIVES.md`. Implement `crates/ocpq/src/lib.rs` with Defs 1–9. Add tests named `def_1_*`, `def_2_*`, … `def_9_*`. Wire negative fixtures to rejection tests. |

### Missing negative fixtures (gap in `covered` rows)

| Primitive | Negative fixture gap |
|---|---|
| **02 — POWL 2.0** | No dedicated negative fixture file. `adversarial_powl_tests.rs` exercises invalid POWL structures in-process, but no standalone fixture file that gets injected and rejected end-to-end (comparable to `ggen_invalid_exclusion.json` for WF-net). |
| **07 — Route-Driven TDD** | No negative fixture. The `AndonPull` typed refusal is the rejection mechanism, but there is no standalone fixture file encoding an invalid route that the harness must refuse. |
| **08 — Benchmark Gates** | No negative fixture. G1–G5 gates are self-contained correctness checks; there is no fixture encoding a "bad benchmark" that gates G1–G5 must collectively reject. |

### Missing test-level paper citations (gap in `covered` rows)

| Primitive | Gap |
|---|---|
| **01 — OCEL v2** | Tests exist (`ocel_real_data_tests.rs`, `ocel_object_centric_audit.rs`) but test names do not cite OCEL 2.0 standard section numbers or Ghahfarokhi et al. definition numbers. |
| **04 — Conformance** | `conformance_model_truth_gaps.rs` names 5 gap tests but does not encode the van der Aalst 2008 formula reference in test names. `ground_truth_conformance_tests.rs` and `self_conformance_tests.rs` are property tests, not paper-definition tests. |

---

## Anti-FM-5 Note

For `covered` status, the test oracle must be the paper definition, **not** the implementation
output. The FM-5 failure mode is: deriving the expected value from the code under test, then
asserting the code produces that value — which proves nothing.

`wasm4pm/tests/wf_soundness.rs` avoids FM-5 by:

1. **Hand-computing fixtures.** `seq_sound_net` and `fig2_non_separable_net` are constructed by
   hand from the paper figures, not generated by the code under test.
2. **Deriving expected values from the mathematical definition.** A sequence net with a single
   source and sink trivially satisfies Def 3.3 by inspection — no code needed to determine the
   oracle.
3. **Naming tests after definitions.** The test name encodes which definition is being verified,
   making the oracle auditable without reading implementation code.

Tests that fail to meet this standard — where the "expected" value is obtained by running the
implementation and recording its output — should be treated as regression oracles (Rank 5),
not mathematical oracles (Rank 1). Rank 1 oracles are required for admission-level coverage.

---

## Full Paper Bibliography

The shortnames used in `academic_coverage.toml` expand to:

| Shortname | Full Citation |
|---|---|
| `kourani_park_van_der_aalst_separable_wfnets_2026` | Kourani, H., Park, G., & van der Aalst, W.M.P. "Separable WF-nets and their Relationship to POWL 2.0." arXiv:2602.15739v3, 2026. |
| `kourani_park_van_der_aalst_choice_graphs_2025` | Kourani, H., Park, G., & van der Aalst, W.M.P. "POWL 2.0: Choice Graphs and Frequent Transitions." CEUR-WS vol. 3783, 2024. |
| `kuesters_van_der_aalst_ocpq_2025` | Küsters, J., & van der Aalst, W.M.P. "Object-Centric Process Querying." arXiv:2506.11541v1, 2025. |
| `van_der_aalst_process_mining_2016` | van der Aalst, W.M.P. *Process Mining: Data Science in Action.* 2nd ed. Springer, 2016. |
| `van_der_aalst_object_centric_process_mining_2019` | van der Aalst, W.M.P. "Object-Centric Process Mining: Dealing with Divergence and Convergence in Event Data." ATAED 2019. |
| `ghahfarokhi_et_al_ocel_2021` | Ghahfarokhi, A.F., et al. "OCEL: A Standard for Object-Centric Event Logs." ICPM 2021. |
| `adriansyah_aligning_observed_2014` | Adriansyah, A. "Aligning Observed and Modeled Behavior." PhD thesis, Eindhoven University, 2014. |
| `van_der_aalst_et_al_alpha_miner_2004` | van der Aalst, W.M.P., et al. "Workflow Mining: Discovering Process Models from Event Logs." *IEEE TKDE*, 2004. |
| `de_medeiros_et_al_alpha_pp_2004` | de Medeiros, A.K.A., et al. "Genetic Process Mining." Proc. ICATPN, 2004. |
| `weijters_van_der_aalst_heuristics_miner_2003` | Weijters, A.J.M.M., & van der Aalst, W.M.P. "Rediscovering Workflow Models from Event-Based Data using Little Thumb." *Integrated Computer-Aided Engineering*, 2003. |
| `leemans_discovering_block_structured_2013` | Leemans, S.J.J., et al. "Discovering Block-Structured Process Models from Event Logs." PETRI NETS 2013. |
| `medeiros_et_al_genetic_process_mining_2004` | de Medeiros, A.K.A., et al. "Genetic Process Mining." Proc. ICATPN, 2004. |
| `van_der_aalst_et_al_ilp_miner_2012` | van der Aalst, W.M.P., et al. "Process Mining — Conformance and Enhancement of Business Processes." Springer, 2012. |
| `munoz_gama_carmona_etconformance_2010` | Munoz-Gama, J., & Carmona, J. "A Fresh Look at Precision in Process Conformance." ICATPN 2010. |
| `pesic_et_al_declare_2007` | Pesic, M., & van der Aalst, W.M.P. "A Declarative Approach for Flexible Business Processes Management." BPM 2006. |
| `van_der_aalst_et_al_social_network_mining_2005` | van der Aalst, W.M.P., et al. "Business Process Mining: An Industrial Application." *IS*, 2007. |
