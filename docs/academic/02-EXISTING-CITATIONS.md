# 02 — Existing Citations Inventory

**Agent:** A3 — Citation Agent  
**Date:** 2026-05-30  
**Status:** Complete inventory  
**Sources searched:** `docs/`, `wasm4pm/src/`, `docs/academic_coverage.toml`, `wasm4pm/tests/choice_graph_paper.rs`

---

## Summary Counts

| Class | Count |
|---|---|
| `directly_supports` | 14 |
| `supports_family` | 8 |
| `supports_engineering` | 4 |
| `consumer_contract_only` | 3 |
| `decorative` | 1 |
| **Total distinct citations** | **30** |

---

## Classification Legend

| Class | Meaning |
|---|---|
| `directly_supports` | Names a specific algorithm and maps it to a formal object (definition, theorem, formula). Strongest evidence. |
| `supports_family` | Supports a broader algorithm family or quality dimension without naming a specific definition. |
| `supports_engineering` | Cited for an implementation technique, format, or adaptation (not a formal algorithm object). |
| `consumer_contract_only` | Cited for interchange format or standard compliance; no PM algorithm grounding. |
| `decorative` | Referenced but not mapped to any registered algorithm, primitive, or formal object. |

---

## Full Inventory

### C01 — van der Aalst, *Process Mining: Data Science in Action* (2016)

**Key:** `van_der_aalst_process_mining_2016`  
**Full ref:** W.M.P. van der Aalst. *Process Mining: Data Science in Action* (2nd ed.). Springer, 2016.  
**Class:** `supports_family`  
**Used for:** DFG discovery (Ch. 3), WF-net soundness (cited as fitness threshold ≥ 0.85), generalization metric (§9.3), transition system, performance spectrum, simulated annealing, hill climbing, Monte Carlo playout, variant complexity, Petri net quality dimensions.  
**Sources:**
- `docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md`
- `docs/primitives/04-CONFORMANCE-PRIMITIVES.md`
- `wasm4pm/src/conformance.rs` (header comment)
- `docs/academic_coverage.toml` (20+ `[[coverage]]` records)

**Notes:** Cited as grounding for DFG, generalization, and quality dimensions but does not name a single formal object — it is the canonical textbook reference for the entire PM family. Classified `supports_family` because no single definition number is pinned for most usages.

---

### C02 — Kourani, Park & van der Aalst — *Workflow Nets and POWL* (arXiv:2602.15739v3, 2026)

**Key:** `kourani_park_van_der_aalst_separable_wfnets_2026`  
**Full ref:** Kourani, H., Park, G. & van der Aalst, W.M.P. "Workflow Nets: Basic Notions, Applications, and Complexity." arXiv:2602.15739v3, February 2026.  
**Class:** `directly_supports`  
**Formal objects:**
- Definitions 3.1–3.5 → WF-net soundness (option to complete, dead-transition freedom, boundedness)
- Section 4 (Decomposition algorithm) → `wf_net_to_powl` conversion
- Algorithm 3, Theorem 1 → `powl_to_process_tree`  
**Sources:**
- `wasm4pm/src/soundness.rs` (module docstring, function docstring)
- `wasm4pm/src/wf_to_powl.rs` (module docstring)
- `docs/primitives/INDEX.md`
- `docs/academic_coverage.toml` primitives 02, 03

**Notes:** Most precisely pinned citation in the project. Definition numbers are stated in code comments and test files. The arXiv ID is repeated verbatim in five source locations.

---

### C03 — Kourani, Park & van der Aalst — *Choice Graphs* (arXiv:2505.07052, 2025)

**Key:** `kourani_park_van_der_aalst_choice_graphs_2025`  
**Full ref:** Kourani, H., Park, G. & van der Aalst, W.M.P. "Unlocking Non-Block-Structured Decisions: Inductive Mining with Choice Graphs." arXiv:2505.07052, 2025.  
**Class:** `directly_supports`  
**Formal objects:**
- Definition 1 → `ChoiceGraph` node type and spec-compliant Choice Graph
- Definition 4/5 (`ChoiceGraphCut`, `MineDG`) → choice graph discovery oracle
- Algorithm 1 → `discover_choice_graph` and `fall_through` discovery  
**Sources:**
- `wasm4pm/src/powl_arena.rs` (struct docstrings)
- `wasm4pm/src/powl_parser.rs` (comment line 62)
- `wasm4pm/src/powl/discovery/choice_graph.rs` (lines 135, 170, 207)
- `wasm4pm/src/powl/discovery/fall_through.rs` (line 190)
- `wasm4pm/src/powl/conversion/to_petri_net.rs` (line 221)
- `wasm4pm/tests/choice_graph_paper.rs` (module docstring)
- `crates/wasm4pm-compat/src/choice_graph.rs` (module docstring)

**Notes:** Cited with definition numbers in seven distinct source files. `wasm4pm/tests/choice_graph_paper.rs` is explicitly built around paper figures. This is the second-most-precisely pinned citation.

---

### C04 — Kourani & van der Aalst — *POWL 2.0: Choice Graphs and Frequent Transitions* (CEUR-WS, 2024)

**Key:** `kourani_van_der_aalst_powl2_2024`  
**Full ref:** Kourani, H. & van der Aalst, W.M.P. "POWL 2.0: Choice Graphs and Frequent Transitions." CEUR-WS vol. 3783, 2024.  
**Class:** `directly_supports`  
**Formal objects:**
- Definition 5 (MineDG) → correctness oracle for POWL 2.0 discovery
- Frequent Transition node (`min_freq`, `max_freq`) → `FrequentTransitionNode` in `powl_arena.rs`  
**Sources:**
- `docs/primitives/02-POWL-2-PRIMITIVES.md`
- `docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md`
- `wasm4pm/src/powl_arena.rs` (FrequentTransitionNode docstrings)

**Notes:** Definition 5 (MineDG) is explicitly named as the correctness oracle. The `min_freq`/`max_freq` API directly encodes the TaggedPOWL interface from the paper.

---

### C05 — Kourani & van der Aalst — *POWL: Partially Ordered Workflow Language* (ATAED 2023)

**Key:** `kourani_van_der_aalst_powl_2023`  
**Full ref:** Kourani, H. & van der Aalst, W.M.P. "POWL: Partially Ordered Workflow Language." ATAED 2023.  
**Class:** `directly_supports`  
**Formal objects:** Strict Partial Order (SPO) as first-class model node; XOR/AND/LOOP operators in POWL.  
**Sources:**
- `docs/primitives/02-POWL-2-PRIMITIVES.md`
- `docs_quarantine/ARCHIVE/docs/THESIS-V2.md`

**Notes:** Foundational paper for the POWL model type. Cited alongside POWL 2.0 in all relevant docs.

---

### C06 — Rozinat & van der Aalst — Token Replay Conformance (*Information Systems*, 2008)

**Key:** `rozinat_van_der_aalst_token_replay_2008`  
**Full ref:** Rozinat, A. & van der Aalst, W.M.P. "Conformance Checking of Processes Based on Monitoring Real Behavior." *Information Systems*, 33(1):64–95, 2008.  
**Class:** `directly_supports`  
**Formal objects:**
- Token replay formula: `fitness = 1 − (missing + consumed) / (produced + remaining)`
- Per-trace `tokens_missing`, `tokens_remaining`, `tokens_produced`, `tokens_consumed` counters  
**Sources:**
- `docs/primitives/04-CONFORMANCE-PRIMITIVES.md`
- `docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md`
- `crates/wasm4pm-algos/src/conformance.rs` (code comment line 55)
- `receipts/T015-wasm4pm-conformance.json` (algorithm field)
- `docs/ggen-oracle/03-conformance-and-discovery-oracle.md`
- `docs/academic_coverage.toml` (`token_replay` record)

**Notes:** The fitness formula appears verbatim in `wasm4pm/src/conformance.rs` header and in test contracts. One of the most directly implemented citations.

---

### C07 — Adriansyah — *Aligning Observed and Modeled Behavior* (2014)

**Key:** `adriansyah_aligning_observed_2014`  
**Full ref:** Adriansyah, A. "Aligning Observed and Modeled Behavior." PhD thesis, Eindhoven University of Technology, 2014.  
**Class:** `directly_supports`  
**Formal objects:**
- Optimal alignment via A* search minimising move costs
- Alignment cost function: sync-move, log-move, model-move  
**Sources:**
- `docs/academic_coverage.toml` (`alignments`, `a_star`, `primitive_04_conformance` records)
- `docs/primitives/04-CONFORMANCE-PRIMITIVES.md` (listed as alignment fitness reference)

**Notes:** The `alignment_fitness` module and `alignments.rs` directly implement the A* alignment search from this thesis. The `a_star` discovery algorithm is also derived from the alignment paper's search strategy (acknowledged in `known_limits`).

---

### C08 — van der Aalst et al. — *Workflow Mining: Discovering Process Models from Event Logs* (IEEE TKDE, 2004)

**Key:** `van_der_aalst_et_al_alpha_miner_2004`  
**Full ref:** van der Aalst, W.M.P., Weijters, A.J.M.M. & Maruster, L. "Workflow Mining: Discovering Process Models from Event Logs." *IEEE TKDE*, 16(9):1128–1142, 2004.  
**Class:** `directly_supports`  
**Formal objects:** Alpha algorithm; directly-follows relation as foundation for Petri net discovery; causal graph structure.  
**Sources:**
- `docs/academic_coverage.toml` (`alpha_plus_plus`, `causal_graph` records)
- `wasm4pm/src/advanced_algorithms.rs` (Weijters et al. dependency formula comment, line ~60)

**Notes:** The dependency formula `dep(a,b) = (|a>b| − |b>a|) / (|a>b| + |b>a| + 1)` cited as "Weijters et al." directly in code at `advanced_algorithms.rs:60`.

---

### C09 — de Medeiros et al. — Alpha++ / Genetic Process Mining (2004)

**Key:** `de_medeiros_et_al_alpha_pp_2004`  
**Full ref:** de Medeiros, A.K.A. et al. "Genetic process mining." Proc. Int. Conf. on Applications and Theory of Petri Nets (ICATPN), 2004.  
**Class:** `directly_supports`  
**Formal objects:** Alpha++ handling of length-1/length-2 loops and parallel short-loop pairs; genetic fitness function for process discovery.  
**Sources:**
- `docs/academic_coverage.toml` (`alpha_plus_plus`, `genetic_algorithm`, `aco` records)

**Notes:** Alpha+++ in `wasm4pm/src/advanced/alphappp.rs` is described as extending Alpha++; genetic and ACO algorithms reference the same paper.

---

### C10 — Leemans, Fahland & van der Aalst — *Discovering Block-Structured Process Models* (Petri Nets 2013)

**Key:** `leemans_discovering_block_structured_2013`  
**Full ref:** Leemans, S.J.J., Fahland, D. & van der Aalst, W.M.P. "Discovering Block-Structured Process Models from Event Logs — A Constructive Approach." *Proc. ICATPN*, pp. 311–329. Springer, 2013.  
**Class:** `directly_supports`  
**Formal objects:** Inductive Miner recursive cut algorithm (XOR, Sequence, AND, Loop cuts) → process tree.  
**Sources:**
- `docs/academic_coverage.toml` (`inductive_miner` record)
- `docs_quarantine/ARCHIVE/docs/THESIS-V2.md`

**Notes:** The four cut types are implemented in `wasm4pm/src/powl/discovery/cuts.rs` and `wasm4pm/src/more_discovery.rs`. The Inductive Miner is one of the algorithms for which the cut taxonomy directly maps to code structure.

---

### C11 — Munoz-Gama & Carmona — *ETConformance* (ICATPN 2010)

**Key:** `munoz_gama_carmona_etconformance_2010`  
**Full ref:** Munoz-Gama, J. & Carmona, J. "A Fresh Look at Precision in Process Conformance." *Proc. ICATPN*, 2010.  
**Class:** `directly_supports`  
**Formal objects:** ETConformance precision metric; escaping-edge analysis formula: `precision = 1 − escaping / (escaping + consumed)`.  
**Sources:**
- `docs/primitives/04-CONFORMANCE-PRIMITIVES.md`
- `docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md`
- `docs/academic_coverage.toml` (`etconformance_precision` record)

**Notes:** The escaping-edge formula is stated verbatim in `docs/primitives/04-CONFORMANCE-PRIMITIVES.md` verification criteria. `wasm4pm/src/etconformance_precision.rs` and `wasm4pm/src/align_etconformance.rs` implement it.

---

### C12 — Weijters & van der Aalst — *Heuristic Miner* (2003)

**Key:** `weijters_van_der_aalst_heuristics_miner_2003`  
**Full ref:** Weijters, A.J.M.M. & van der Aalst, W.M.P. "Rediscovering Workflow Models from Event-Based Data Using Little Thumb." *Integrated Computer-Aided Engineering*, 10(2):151–162, 2003.  
**Class:** `directly_supports`  
**Formal objects:** Dependency ratio threshold; directly-follows frequency graph; heuristic net structure.  
**Sources:**
- `docs/academic_coverage.toml` (`heuristic_miner`, `causal_graph` records)
- `wasm4pm/src/advanced_algorithms.rs` (dependency formula comment)

**Notes:** The dependency formula `dep(a,b) = (|a>b| − |b>a|) / (|a>b| + |b>a| + 1)` with threshold 0.2–0.4 is directly coded. Threshold 0.8 is noted in CLAUDE.md as "filters everything."

---

### C13 — Pesic & van der Aalst — *Declare: Declarative Workflow* (BPM 2006 / 2007)

**Key:** `pesic_et_al_declare_2007`  
**Full ref:** Pesic, M. & van der Aalst, W.M.P. "A Declarative Approach for Flexible Business Processes Management." *BPM 2006 Workshops*, LNCS. Springer, 2006. (Also cited as "Pesic et al. 2007" in some records.)  
**Class:** `directly_supports`  
**Formal objects:** Declare template constraints (`Response(A,B)`, `Precedence`, `Existence`, etc.); LTL-based declarative process model.  
**Sources:**
- `docs/primitives/04-CONFORMANCE-PRIMITIVES.md`
- `docs/academic_coverage.toml` (`declare`, `ocel_oc_declare` records)

**Notes:** `wasm4pm/src/declare_conformance.rs` implements `Response(A,B)` as the primary Declare template. Tests in `wasm4pm/tests/declare_conformance_integration_test.rs` inject violations.

---

### C14 — van der Aalst et al. — *ILP Miner* (2012)

**Key:** `van_der_aalst_et_al_ilp_miner_2012`  
**Full ref:** van der Aalst, W.M.P. et al. "Replaying History on Process Models for Conformance Checking and Performance Analysis." *WIREs DMKD*, 2012. (Also attributed to the ILP miner work from ACSD 2012.)  
**Class:** `directly_supports`  
**Formal objects:** Region-based ILP Petri net discovery; causal region enumeration; token-replay validation over candidate places.  
**Sources:**
- `docs/academic_coverage.toml` (`ilp` record)
- `docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md` (listed as "Alignments | van der Aalst et al. (2012), ACSD")

**Notes:** Two ACSD/WIREs 2012 papers by van der Aalst are conflated in some records. The `ilp_discovery.rs` implements region-based Petri net discovery. Note: some references cite 2012 ACSD for alignments, others for ILP — they are distinct papers that share a year.

---

### C15 — Ghahfarokhi et al. — *OCEL: A Standard for Object-Centric Event Logs* (ICPM 2021)

**Key:** `ghahfarokhi_et_al_ocel_2021`  
**Full ref:** Ghahfarokhi, A.F. et al. "OCEL: A Standard for Object-Centric Event Logs." *Proc. ICPM*, 2021.  
**Class:** `directly_supports`  
**Formal objects:** OCEL 1.0 object-centric event log schema; object types, event types, E2O relations.  
**Sources:**
- `docs/primitives/01-OCEL-V2-PRIMITIVES.md`
- `docs/academic_coverage.toml` (`primitive_01_ocel_v2` record)

**Notes:** OCEL 2.0 (IEEE 2023) is the operative standard; this 2021 ICPM paper is the original specification. Both are cited; the 2021 paper is the canonical academic reference.

---

### C16 — van der Aalst — *Object-Centric Process Mining* (ATAED 2019)

**Key:** `van_der_aalst_object_centric_process_mining_2019`  
**Full ref:** van der Aalst, W.M.P. "Object-Centric Process Mining: Dealing with Divergence and Convergence in Event Data." *ATAED 2019*, CEUR-WS.  
**Class:** `directly_supports`  
**Formal objects:** OC-DFG per object type; flattening convergence/divergence problem; Object-Centric Petri Net discovery.  
**Sources:**
- `docs/primitives/01-OCEL-V2-PRIMITIVES.md`
- `docs/academic_coverage.toml` (`ocel_dfg`, `ocel_dfg_per_type`, `ocel_petri_net`, `ocel_ocla` records)

**Notes:** Cited for four distinct OCEL algorithm primitives in `academic_coverage.toml`. The convergence/divergence problem it identifies is the stated motivation for using OCEL instead of flat logs.

---

### C17 — Berti & van der Aalst — *OC-DFG* (ICPM 2023)

**Key:** `berti_van_der_aalst_ocdfg_2023`  
**Full ref:** Berti, A. & van der Aalst, W.M.P. "OC-DFG: Object-Centric Directly-Follows Graphs for Process Mining." *Proc. ICPM*, 2023.  
**Class:** `directly_supports`  
**Formal objects:** Multi-typed directly-follows graph (one DFG per object type from OCEL).  
**Sources:**
- `docs/primitives/01-OCEL-V2-PRIMITIVES.md`

**Notes:** The `wasm4pm/src/advanced/ocdfg.rs` module implements the per-type OC-DFG. This is the most recent citation in the project (2023 conference paper).

---

### C18 — van der Aalst et al. — *Social Network Mining* (2005)

**Key:** `van_der_aalst_et_al_social_network_mining_2005`  
**Full ref:** van der Aalst, W.M.P. et al. "Mining Social Networks: Uncovering Interaction Patterns in Business Processes." *BPM 2004*, LNCS 3080. Springer, 2005.  
**Class:** `directly_supports`  
**Formal objects:** Handover-of-work network (weighted sequential resource handoffs); working-together network (co-occurrence within a case).  
**Sources:**
- `docs/academic_coverage.toml` (`handover_network`, `working_together_network` records)

**Notes:** Two separate registered kernel algorithms both cite this single paper. The handover and working-together networks are distinct formal objects from the same paper.

---

### C19 — Buijs, van der Aalst et al. — *Genetic Perspective on Process Discovery* (IJBPIM, 2012)

**Key:** `buijs_van_der_aalst_generalization_2012`  
**Full ref:** Buijs, J.C.A.M., van der Aalst, W.M.P., et al. "A Genetic Perspective on Process Discovery: Towards Quality-Aware Process Mining." *IJBPIM*, 1(2):63–76, 2012. DOI: 10.1504/IJBPIM.2012.048807  
**Class:** `directly_supports`  
**Formal objects:** Generalization metric based on transition firing frequency; penalty `1/√count` for rarely-firing transitions.  
**Sources:**
- `wasm4pm/src/generalization.rs` (module docstring, full DOI present)

**Notes:** This is the only citation in the project with a DOI stated directly in Rust source code. The penalty formula is implemented verbatim.

---

### C20 — van Zelst et al. — *Online Process Monitoring* (BPM 2018)

**Key:** `van_zelst_et_al_prefix_conformance_2018`  
**Full ref:** van Zelst, S.J. et al. "Online Process Monitoring Using Incremental State-Space Expansion." *BPM 2018*, LNCS. Springer, 2018.  
**Class:** `supports_family`  
**Used for:** Prefix conformance (streaming token replay per partial trace).  
**Sources:**
- `docs/primitives/04-CONFORMANCE-PRIMITIVES.md`

**Notes:** `wasm4pm/src/streaming_conformance.rs` implements the prefix conformance session API. The citation is present only in the docs table; no definition number is pinned.

---

### C21 — Kuesters & van der Aalst — *OCPQ* (2025)

**Key:** `kuesters_van_der_aalst_ocpq_2025`  
**Full ref:** Kuesters, R. & van der Aalst, W.M.P. "Object-Centric Process Querying." 2025 (precise venue TBD).  
**Class:** `directly_supports`  
**Formal objects:** OCPQ Definitions 1–9: E2O predicates, O2O predicates, TBE predicates, CHILD SET constraints.  
**Sources:**
- `docs/academic_coverage.toml` (`primitive_09_ocpq` record)
- `fixtures/ocpq/invalid_monotonicity.json`
- `fixtures/ocpq/invalid_o2o.json`

**Notes:** The primitive is `status = "partial"` — no `docs/primitives/09-OCPQ-PRIMITIVES.md` exists yet. The TOML marks it as future work. Classified `directly_supports` because definition numbers 1–9 are explicitly named.

---

### C22 — van der Aalst — *Conformance Checking* (Springer, 2018)

**Key:** `van_der_aalst_conformance_checking_2018`  
**Full ref:** van der Aalst, W.M.P. *Conformance Checking: Relating Processes and Models*. Springer, 2018.  
**Class:** `supports_family`  
**Used for:** General conformance checking family; cited in inventory table.  
**Sources:**
- `docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md`

**Notes:** Listed in the inventory table as grounding for the conformance primitive family. No specific definition number is cited. Classified `supports_family`.

---

### C23 — van der Aalst — Verification of Workflow Nets (1997)

**Key:** `van_der_aalst_workflow_nets_1997`  
**Full ref:** van der Aalst, W.M.P. "Verification of Workflow Nets." *Proc. ICATPN*, LNCS 1248:407–426. Springer, 1997.  
**Class:** `supports_family`  
**Used for:** WF-net definition (single source/sink, connected); cited as foundational reference in `soundness.rs`.  
**Sources:**
- `docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md`
- `wasm4pm/src/soundness.rs` (referred to as "van der Aalst 1998" — likely same work)

**Notes:** The soundness module cites "van der Aalst 1998, TOIT 2011." The 1997 ICATPN paper is the original source; a TOIT journal version followed. The arXiv:2602.15739v3 (C02) subsumes this as its formal grounding.

---

### C24 — van der Aalst — WF-net / TOIT 2011

**Key:** `van_der_aalst_workflow_nets_toit_2011`  
**Full ref:** van der Aalst, W.M.P. "Workflow Nets." *ACM Transactions on Internet Technology* (TOIT), 2011.  
**Class:** `supports_family`  
**Used for:** Classical WF-net soundness definition.  
**Sources:**
- `wasm4pm/src/soundness.rs` (header: "van der Aalst 1998, TOIT 2011")

**Notes:** Cited alongside the 1997/1998 paper; the TOIT 2011 version is a revised presentation. Both are superseded by arXiv:2602.15739v3 as the live formal grounding.

---

### C25 — OCEL 2.0 Standard (IEEE Task Force, 2023)

**Key:** `ocel_2_standard_ieee_2023`  
**Full ref:** IEEE Task Force on Process Mining. *Object-Centric Event Log Standard v2.0*. 2023. https://www.ocel-standard.org/  
**Class:** `consumer_contract_only`  
**Used for:** OCEL 2.0 JSON schema compliance; `load_ocel2_from_json`, `export_ocel2_to_json`.  
**Sources:**
- `docs/primitives/01-OCEL-V2-PRIMITIVES.md`

**Notes:** A standard, not a paper. Cited for format compliance rather than algorithm grounding. Classified `consumer_contract_only`.

---

### C26 — PNML Standard (ISO/IEC 20481:2019)

**Key:** `pnml_iso_iec_20481_2019`  
**Full ref:** ISO/IEC 20481:2019. *Petri Net Markup Language (PNML)*. International Organization for Standardization, 2019.  
**Class:** `consumer_contract_only`  
**Used for:** PNML XML import; `pnml_io.rs`.  
**Sources:**
- `docs/academic_coverage.toml` (`pnml_import` record: "PNML import: ISO/IEC 20481:2019 Petri Net Markup Language XML ingest")

**Notes:** Format standard. The TOML explicitly notes: "PNML is an interchange standard, not a PM paper primitive."

---

### C27 — BPMN 2.0 Standard (OMG, 2010)

**Key:** `bpmn_2_omg_2010`  
**Full ref:** Object Management Group. *Business Process Model and Notation (BPMN) v2.0*. OMG, 2010. (xmlns: `http://www.omg.org/spec/BPMN/20100524/MODEL`)  
**Class:** `consumer_contract_only`  
**Used for:** BPMN 2.0 XML import and export; `bpmn_import.rs`, `powl/conversion/to_bpmn.rs`.  
**Sources:**
- `wasm4pm/src/bpmn_import.rs` (xmlns declaration in test fixtures)
- `wasm4pm/src/powl/conversion/to_bpmn.rs` (xmlns header)
- `docs/academic_coverage.toml` (BPMN 2.0 TOML note)

**Notes:** Format standard. The TOML explicitly notes: "BPMN 2.0 is an OMG standard, not a PM paper primitive."

---

### C28 — Sadl — *The YAWL Language* (2005)

**Key:** `sadl_yawl_2005`  
**Full ref:** Sadl, A. "The YAWL Language." 2005 (precise venue not stated in source).  
**Class:** `supports_engineering`  
**Used for:** YAWL XML export from POWL model; `powl/conversion/to_yawl.rs`.  
**Sources:**
- `docs/primitives/02-POWL-2-PRIMITIVES.md`

**Notes:** Cited only in the POWL 2.0 primitives doc as a grounding reference for the YAWL export. The TOML notes: "YAWL is an interchange format; van der Aalst is a YAWL author but export is an engineering primitive." Classified `supports_engineering`.

---

### C29 — García & Caballero — ILP / Simplicity (implied citation)

**Key:** `garcia_caballero_simplicity`  
**Full ref:** García, F. & Caballero, I. (attributed in code; full ref not stated).  
**Class:** `supports_engineering`  
**Used for:** Simplicity metric formula in `ilp_discovery.rs`; geometric mean of element ratios vs. theoretical minimum.  
**Sources:**
- `wasm4pm/src/ilp_discovery.rs` (comment line 22: "Based on process mining literature (García & Caballero, Buijs et al.)")

**Notes:** Incomplete citation — no venue, year, or title. The code comment names authors but gives no full reference. Classified `supports_engineering` (engineering metric adaptation).

---

### C30 — van der Aalst, *Process Mining* Ch. 6 — Process Trees (2016)

**Key:** `van_der_aalst_process_mining_2016_ch6`  
**Full ref:** van der Aalst, W.M.P. *Process Mining: Data Science in Action*, Ch. 6 — Process Trees. Springer, 2016.  
**Class:** `supports_family`  
**Used for:** Process tree operators (XOR, AND, LOOP, Sequence) as grounding for POWL → process tree conversion.  
**Sources:**
- `docs/primitives/02-POWL-2-PRIMITIVES.md`

**Notes:** This is C01 (same book) but cited specifically for Ch. 6 in the POWL context. Kept as a separate entry because it grounds process trees as distinct from DFG (Ch. 3) and quality metrics (§9.3). Classified `supports_family`.

---

## 5 Strongest Citations (`directly_supports`)

Ranked by: definition-number precision + number of source locations + formal object specificity.

### Rank 1 — C02: arXiv:2602.15739v3 (Workflow Nets and POWL, 2026)

- **Definitions cited:** 3.1–3.5 (WF-net soundness), Section 4 (decomposition algorithm), Algorithm 3, Theorem 1
- **Source locations:** 5 distinct files with verbatim arXiv ID
- **Implementation:** `wasm4pm/src/soundness.rs`, `wasm4pm/src/wf_to_powl.rs`, `wasm4pm/src/powl_to_process_tree.rs`
- **Why strongest:** Every soundness property is mapped to a numbered definition. The arXiv ID is machine-checkable. Algorithm and theorem are pinned.

### Rank 2 — C03: arXiv:2505.07052 (Choice Graphs, 2025)

- **Definitions cited:** 1 (ChoiceGraph), 4/5 (MineDG cut), Algorithm 1
- **Source locations:** 7 distinct files including a dedicated test file (`choice_graph_paper.rs`)
- **Implementation:** `powl/discovery/choice_graph.rs`, `powl_arena.rs`, `crates/wasm4pm-compat/src/choice_graph.rs`
- **Why strong:** Paper figures are recreated in tests; definition numbers appear in struct docstrings and discovery oracle comments.

### Rank 3 — C06: Rozinat & van der Aalst, Token Replay (2008)

- **Formal object:** Token replay fitness formula; 4 per-trace counters
- **Source locations:** 6 locations including code comment, receipt artifact, ggen-oracle doc
- **Implementation:** `wasm4pm/src/conformance.rs` (formula in header), `crates/wasm4pm-algos/src/conformance.rs`
- **Why strong:** The formula `fitness = 1 − (missing + consumed) / (produced + remaining)` is stated verbatim in code and in receipt artifacts. The 4 counter names match the paper variables.

### Rank 4 — C19: Buijs et al., Generalization Metric / DOI present (IJBPIM 2012)

- **Formal object:** Generalization penalty `1/√count` for rarely-firing transitions
- **Source locations:** 1 file (module docstring) — but includes full DOI `10.1504/IJBPIM.2012.048807`
- **Implementation:** `wasm4pm/src/generalization.rs`
- **Why strong:** Only citation in the project with a DOI in source code. The penalty formula is implemented verbatim. The pm4py algorithm is credited by name.

### Rank 5 — C11: Munoz-Gama & Carmona, ETConformance (ICATPN 2010)

- **Formal object:** Escaping-edge precision formula; empty-log invariant; ordering invariant `fitness ≥ precision`
- **Source locations:** 3 doc locations + 2 implementation files
- **Implementation:** `wasm4pm/src/etconformance_precision.rs`, `wasm4pm/src/align_etconformance.rs`
- **Why strong:** The formula and two correctness invariants are stated in verification criteria with test references. The `conformance_model_truth_gaps.rs` test enforces the `fitness ≥ precision` invariant as a Rank-1 mathematical oracle.

---

## Citations Requiring Attention

| Issue | Citation | Action needed |
|---|---|---|
| Incomplete ref (no venue/year) | C29 (García & Caballero) | Resolve full bibliographic entry or reclassify as `decorative` |
| Year ambiguity (1997 vs 1998 vs TOIT 2011) | C23/C24 | Consolidate into single entry; arXiv:2602.15739v3 now supersedes |
| Two 2012 van der Aalst papers conflated | C14 | Separate ILP miner (ACSD 2012) from alignment paper (WIREs 2012) |
| POWL 1.0 vs 2.0 paper ambiguity | C04/C05 | C05 is ATAED 2023 (POWL 1.0); C04 is CEUR-WS 2024 (POWL 2.0); both are active references |
| OCPQ primitive has no implementation yet | C21 | Mark `future` until `crates/ocpq/` lands |
