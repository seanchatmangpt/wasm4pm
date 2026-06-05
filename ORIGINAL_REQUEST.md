# Original User Request

## Initial Request — 2026-05-30T01:16:00-07:00

# Teamwork Project Prompt

`wasm4pm` will be the external process-law oracle for the `ggen` generative pipeline. It must upgrade from simple OCEL parsing to providing online conformance checking, process discovery, and prefix conformance (impossible-trace detection) to act as an Andon oracle for autonomous agent workflows.

Working directory: /Users/sac/wasm4pm
Integrity mode: development

## Requirements

### R1. Streaming Online Conformance and Prefix Detection
Implement an NDJSON/event-stream intake that can process `ggen`'s append-only logs in real-time. It must provide "prefix conformance" to detect when a trace can no longer lawfully complete (e.g., receipt before gate) and trigger early Andon halts.

### R2. Process-Model Registry and Variant Control
Build a registry of canonical Gall checkpoint process models (e.g., `living_diagnostic_clear_v1`) that defines allowed events, required orderings, and terminal states. It must classify observed traces against these models, detecting and governing variants (lawful vs. forbidden).

### R3. Object-Centric Causality and Receipt Provenance
Support OCEL 2.0 object-centric causality queries. It must track relationships between agents, files, diagnostic species, and receipts to enable provenance queries (e.g., "Which receipt depends on which source-law repair?").

### R4. Process-Law Query Language (OCPQ) & Testing Corpus
Implement a small process-query language (OCPQ) over OCEL to adjudicate queries from `ggen` (e.g., `REQUIRE DiagnosticRaised BEFORE RouteSelected`). Provide a fixture corpus of canonical valid and invalid traces to continuously verify the process models.

## Acceptance Criteria

### Prefix Conformance
- [ ] System correctly parses an NDJSON trace stream.
- [ ] System correctly halts (early Andon) on an impossible prefix trace (e.g., ReceiptEmitted before GatePassed).

### Model Conformance
- [ ] System correctly discriminates between valid and invalid canonical traces for the `living_diagnostic_clear_v1` checkpoint model.
- [ ] A fixture corpus of traces is created to verify both positive and negative cases.

## Follow-up — 2026-05-30T08:16:12Z

Critical implementation constraint: "implement like a dr wil van der aalst core team AGI".
This means you must implement formal, rigorous process mining techniques:
- Use formal Petri net / Workflow net semantics.
- Implement token-based replay or formal alignment-based conformance checking.
- Prefix conformance must be mathematically grounded in reachability/state space rather than ad-hoc regex or string matching.
- Approach the architecture with the rigor of a core researcher in the process mining community.

## Follow-up — 2026-05-30T09:08:44Z

Implement the ggen Living LSP, Open Ontology subsystem, and receipt/OCEL process evidence pipeline, integrating it with wasm4pm conformance checks according to the provided C4 architecture specifications.

Working directories:
- `/Users/sac/wasm4pm`
- `/Users/sac/ggen`

Integrity mode: development

Verification Resources:
- `/Users/sac/ggen/crates/ggen-lsp/tests` (specifically `ggen_tpl_001_stale_clear.rs`, `ggen_tpl_001_living_loop.rs`)
- `/Users/sac/wasm4pm/tests/proof`

## Requirements

### R1. Read-Only Living LSP (ggen-lsp)
Implements read-only author-time admissibility in `ggen-lsp` (`server.rs`, `state.rs`, `check.rs`, `project_index.rs`). Refreshes and indexes project relations across rules, queries, templates, and output declarations. Detects project-wide relation diagnostics and resolves diagnostic species/routes at raise time. Implements "living clear" behavior: when a repair occurs, the LSP performs a residual-preserving clear (`old_keys - new_keys`) and updates the pending repair store.

### R2. Open Ontology / Source-Law Subsystem
Integrates the `ggen.toml` rule surface, public ontology sources (Turtle/RDF), SPARQL queries (.rq), template surfaces (.tera), and output declarations. Validates the project structure against SHACL shapes and provenance vocabulary (PROV-O, DCTERMS, SKOS).

### R3. Receipt / OCEL / Process Evidence Pipeline
Emits diagnostic lifecycle event traces using standard event builders (`intel/events.rs`) for the 6-link lifecycle: `DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted`. Appends events to `.ggen/ocel/agent-edit-events.ocel.jsonl` in append-only NDJSON (one `OcelEvent` per line).

### R4. wasm4pm Conformance Oracle Integration
Integrates the `wpm` CLI (`wasm4pm-cli`) to consume ggen's emitted OCEL event stream. Hand off process mining and conformance evaluation to `wpm oracle conform` and `wpm oracle attest`, checking trace causality and returning Admitted/Refused verdicts.

## Acceptance Criteria

### LSP Behavior & Living Clear
- [ ] LSP successfully compiles and runs checks in headless mode, failing on invalid relation setups and passing on repaired setups.
- [ ] Living diagnostic clear logic is proven: repairing a template or query re-analyzes relations, removes resolved diagnostics from the published set while preserving unrelated active diagnostics (residual preservation).

### OCEL Log Emission
- [ ] Valid `.ocel.jsonl` trace log is written to `.ggen/ocel/agent-edit-events.ocel.jsonl` containing the 6-link activities.
- [ ] The serialized-name constraint is satisfied: event properties use aliases (`activity`/`timestamp`/`id`/`relationships`) to match legacy test expectations without breaking OCEL 2.0 standards.

### Oracle Conformance
- [ ] `wpm oracle conform` parses the emitted NDJSON stream and validates it against the registered Petri net / DFG models.
- [ ] Negative test cases (e.g. `ReceiptEmitted` before `GatePassed`) are correctly Refused by the oracle.

## Follow-up — 2026-05-30T18:15:04Z

You are operating inside:
~/wasm4pm

You are not building project management software.
You are not building an agent dashboard.
You are not building a ggen-specific orchestration app.
You are building the process-mining primitive kernel that other systems use when they need lawful process evidence, process models, conformance, replay, object-centric traces, and process-world fixtures.

The immediate downstream consumer is ggen, but ggen must not define the architecture.
The architecture is defined by the process-mining papers and primitives:
- OCEL / object-centric event data
- POWL 2.0 / partial orders / choice graphs
- WF-nets / Petri nets / soundness / token replay
- alignments
- Declare / OC-Declare
- OC-DFG / OC-Petri nets
- process trees
- event-log projections
- OCPQ / object-centric process queries
- process-world generation
- real-data validation
- route-driven TDD

# Core doctrine
wasm4pm owns the process primitives.
Other systems emit or consume evidence through those primitives.

Do not build ggen behavior into wasm4pm.
Do not build Gall-specific workflow management into wasm4pm.
Do not build Claude-agent management into wasm4pm.

Build primitives that can support:
- ggen
- open-ontologies
- process-world foundries
- receipt replay corpora
- POWL conformance
- OCEL validation
- object-centric query systems
- route-driven TDD

# Grounding
- OCEL is the truth surface; case-centric logs are projections from object-centric worlds.
- POWL 2.0 supplies the lawful process-shape side, including partial orders and choice graphs for non-block-structured decisions and cycles.
- WF-net → POWL 2.0 → OCEL simulation → conformance replay → receipt is the complete field loop.
- Route-driven TDD already frames exact conformance as the admission gate: below 1.0 becomes AndonPull.
- The benchmark doctrine already demands determinism, receipt integrity, truth gates, equivalence gates, and report completeness, not superficial success.

# Primary mission
Build a Process Primitive Foundry inside wasm4pm.
The foundry must expose reusable primitives for:
1. object-centric process worlds
2. OCEL v2 logs
3. POWL 2.0 models
4. WF-net / Petri-net projections
5. process-tree projections
6. positive and negative conformance traces
7. replay fixtures
8. route-driven tests
9. object-centric process queries
10. receipt-ready process evidence

# Forbidden framing
Do not say: project management, task tracking, agent dashboard, workflow status board, team coordination app.
Do say: process primitive, object-centric evidence, POWL route, WF-net projection, token replay, alignment, conformance, soundness, process world, replay corpus, receipt fixture, route-driven test.

# 10-agent topology
- Agent 1 (Primitive inventory agent) owns docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md
- Agent 2 (OCEL v2 primitive agent) owns docs/primitives/01-OCEL-V2-PRIMITIVES.md, crates/ocel-core/ if already present or appropriate, OCEL-related tests
- Agent 3 (POWL 2.0 primitive agent) owns docs/primitives/02-POWL-2-PRIMITIVES.md, POWL model modules, POWL tests
- Agent 4 (WF-net / Petri-net primitive agent) owns docs/primitives/03-WFNET-PETRI-PRIMITIVES.md, Petri/WF-net modules, PNML import/export if present, token-replay tests
- Agent 5 (Conformance primitive agent) owns docs/primitives/04-CONFORMANCE-PRIMITIVES.md, conformance modules, conformance tests
- Agent 6 (Process-world foundry agent) owns docs/primitives/05-PROCESS-WORLD-FOUNDRY.md, process-world generator modules/tests
- Agent 7 (Negative fixture / sabotage corpus agent) owns docs/primitives/06-NEGATIVE-CORPUS.md, negative fixture directories
- Agent 8 (Route-driven TDD primitive agent) owns docs/primitives/07-ROUTE-DRIVEN-TDD.md, testing modules, macro design if appropriate
- Agent 9 (Benchmark / real-data gate agent) owns docs/primitives/08-BENCHMARK-GATES.md, benchmark gate tests, closed-claw reports
- Agent 10 (Primitive build-plan synthesizer) owns docs/primitives/00-BUILD-PLAN.md, docs/receipts/WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md

## Follow-up — 2026-05-30T18:26:35Z

Evaluate the status of all 60 process mining, ML, and AI algorithms registered in the codebase reachability evidence. Produce a dedicated evaluation document for each algorithm inside a designated docs subdirectory without modifying any source files or git state.

Working directory: /Users/sac/wasm4pm
Integrity mode: demo

## Requirements

### R1. Algorithm Identification
Extract the complete list of 60 algorithms from `artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v26.5.29.json`.

### R2. Status & Conformance Verification
For each algorithm, verify its implementation status:
- Reachability paths and WASM exports (matching with `ALGORITHM_REACHABILITY_EVIDENCE.v26.5.29.json` and WASM bindings).
- Test execution status (locate and run the corresponding tests using `vitest`, `cargo test`, or relevant test runner commands).
- Behavior / Refusal correctness as outlined in `AGENTS.md`.

### R3. Per-Algorithm Documentation
Write a separate evaluation document for each algorithm under `/Users/sac/wasm4pm/docs/algorithms_evaluation/`. Name each file `[algorithm_id].md`. Each document must contain:
1. **Metadata**: ID, export name, and reachability.
2. **Implementation Status**: Path to source code and WASM bindings.
3. **Testing Status**: Test location and command to run, plus pass/fail results.
4. **Behavior Details**: Correct refusals, invariants checked, and any identified gaps.

### R4. Workspace Protection
Ensure no source files (in `packages/*/src/` or `crates/*/src/`) are modified, and no git changes/commits are staged.

## Acceptance Criteria

### Execution & Deliverables
- [ ] 60 distinct markdown files are created under `/Users/sac/wasm4pm/docs/algorithms_evaluation/`, one for each registered algorithm.
- [ ] Each document contains sections for Metadata, Implementation, Testing, and Behavior.
- [ ] Test status in the documents corresponds to actual execution runs.
- [ ] Git status confirms no source files in the repository have been modified.

## Follow-up — 2026-05-30T20:21:32Z

Complete the process-mining primitive kernel implementation inside `/Users/sac/wasm4pm`. This involves implementing and validating the 10-agent primitive topology (Inventory, OCEL v2, POWL 2.0, Petri-Nets, Conformance, Foundry, Negative Corpus, Route-driven TDD, Benchmark Gates, and Build-Plan Synthesizer) and ensuring that all process-mining, ML, and AI algorithms are fully verified and documented.

Working directory: /Users/sac/wasm4pm
Integrity mode: development

## Requirements

### R1. Complete the Primitives Documentation
Fill out and complete the following documentation files under `/Users/sac/wasm4pm/docs/primitives/`, ensuring they do not contain placeholders, TODOs, or stubs:
- `00-WASM4PM-PRIMITIVE-INVENTORY.md`: A complete inventory mapping all process primitives, source files, tests, and paper groundings.
- `06-NEGATIVE-CORPUS.md`: Detailed catalog of invalid traces, invalid models, and negative cases (missing required events, events out of order, dead transitions, unsafe nets, OCEL relation violations) and their respective locations/fixtures.
- `07-ROUTE-DRIVEN-TDD.md`: Specification of route-driven TDD and the powl_test macro-driven testing substrate.
- `08-BENCHMARK-GATES.md`: Verification specification for the G1-G5 benchmark gates.
- `00-BUILD-PLAN.md`: A synthesized dependency DAG showing the build sequence, existing/new modules, tests, benchmark gates, paper grounding, and a final verdict of `ALIVE`/`PARTIAL`/`BLOCKED`.

### R2. Synthesize the Primitive Kernel Receipt
Complete the implementation and generation of `docs/receipts/WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md` to record the cryptographic and operational validation of all 10 primitive areas.

### R3. Test Suite Verification
Ensure that both the Rust cargo workspace and the TypeScript monorepo testing harnesses run successfully. All tests must compile and pass cleanly without warnings.

## Acceptance Criteria

### Documentation Completeness
- [ ] The files `00-WASM4PM-PRIMITIVE-INVENTORY.md`, `06-NEGATIVE-CORPUS.md`, `07-ROUTE-DRIVEN-TDD.md`, `08-BENCHMARK-GATES.md`, and `00-BUILD-PLAN.md` are fully written with zero placeholder text or "TODO" / "Scaffolded" markers.
- [ ] The build plan synthesizes a valid dependency DAG with a final status/verdict of `ALIVE`.
- [ ] `WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md` is fully completed and documents the cryptographic/BLAKE3 receipt validation of the primitives.

### Code & Test Correctness
- [ ] Running `cargo test --workspace` in `/Users/sac/wasm4pm` compiles and passes cleanly with 0 failures.
- [ ] All tests for OCEL v2 log validation/flattening, WF-net to POWL translation, structural Petri/WF-net predicates, and Order-to-Cash process world foundry execute successfully.
- [ ] The codebase has no compiler warnings or Clippy violations.

## Follow-up — 2026-06-05T06:19:04Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Run implementation swarm using teamwork_preview

## Project Description
Implement pm4py-lsp as a Living LSP Gall checkpoint for wasm4pm parity, using max/tower-lsp-max only as the LSP 3.18 protocol substrate. Promote pm4py-lsp from PARTIAL_ALIVE to PM4PY-LSP-002_ALIVE.

Working directory: /Users/sac/wasm4pm
Integrity mode: benchmark

## Requirements

### R1. Boundary Law & Substrate Purity
- `max/tower-lsp-max` is protocol substrate only.
- `pm4py-lsp` owns PM4Py behavior.
- `wasm4pm` owns future Rust/WASM parity implementation.
- `wasm4pm-compat` owns typed evidence/admission substrate.
- DO NOT add PM4Py, XES, OCEL, BPMN, Petri net, POWL, fitness, precision, conformance, receipt semantics, or wasm4pm parity semantics to max/tower-lsp-max core.

### R2. Deterministic Snapshots & Reload Verification
- SnapshotId is deterministic from document state and relevant config.
- Parity fixtures and receipts must be persisted to disk under `fixtures/pm4py-parity/` and `receipts/pm4py-lsp/` respectively.
- Persisted fixtures and receipts must be reload-tested.

### R3. LSP Lifecycle Integration
- `didOpen` publishes diagnostics through the LSP service.
- `didChange` refreshes diagnostics through the LSP service.
- `codeAction` returns the expected PM4Py repair.
- `executeCommand` applies the edit and returns a receipt.
- Malformed command arguments refuse safely.

### R4. Equivalence and Conformance
- Conformance vector shifts from Refused to Admitted only after repair.
- PM4Py semantics remain strictly inside `crates/pm4py-lsp`.
- The wasm4pm parity fixture contract is defined in Rust with equivalence kinds and verdict classification.

### R5. Required File Tree Target
Aim for the following codebase layout:
```
crates/pm4py-lsp/
  Cargo.toml
  src/
    lib.rs
    analysis.rs
    diagnostics.rs
    server.rs
    actions.rs
    commands.rs
    receipts.rs
    fixtures.rs
    parity.rs
    pm4py_bridge.rs
  tests/
    static_analysis_test.rs
    diagnostics_test.rs
    lsp_lifecycle_test.rs
    actions_commands_test.rs
    receipts_fixtures_test.rs
    parity_contract_test.rs
    pm4py_bridge_test.rs

fixtures/
  pm4py-parity/
    .gitkeep

receipts/
  pm4py-lsp/
    .gitkeep

docs/
  checkpoints/
    PM4PY-LSP-001.md
    PM4PY-LSP-002.md
    WASM4PM-PARITY-001.md
    MAX-PURITY-FENCE.md
  reports/
    pm4py-lsp-agent-reports/
      CHECKLIST.md
      coordinator.md
      boundary.md
      static_analysis.md
      diagnostic.md
      lsp_lifecycle.md
      code_action_command.md
      receipt_fixture.md
      pm4py_runtime.md
      wasm4pm_parity.md
      VERIFICATION.md
```

## Agent Work Assignments & Roles

### AGENT 1 — coordinator_agent
- **Role:** Own mission coherence, checkpoint law, and final integration plan.
- **Owned files:**
  - `docs/reports/pm4py-lsp-agent-reports/coordinator.md`
  - `docs/checkpoints/PM4PY-LSP-002.md` (draft only until verifier finalizes)
- **Tasks:**
  1. Read current pm4py-lsp code, tests, Cargo.toml, and checkpoint docs.
  2. Build a surface map (current implemented surfaces, missing PM4PY-LSP-002 surfaces, risky overclaims, files to edit).
  3. Create a shared checklist in `docs/reports/pm4py-lsp-agent-reports/CHECKLIST.md`.
  4. Maintain PARTIAL_ALIVE discipline and record blockers.

### AGENT 2 — boundary_agent
- **Role:** Enforce max protocol purity and dependency discipline.
- **Owned files:**
  - `docs/reports/pm4py-lsp-agent-reports/boundary.md`
  - `docs/checkpoints/MAX-PURITY-FENCE.md`
- **Tasks:**
  1. Inspect workspace dependencies: `vendors/tower-lsp-max`, `crates/pm4py-lsp/Cargo.toml`, root `Cargo.toml`.
  2. Verify no PM4Py-specific code in max core.
  3. Propose durable vendor strategy.
  4. Add/maintain MAX-PURITY-FENCE doc.

### AGENT 3 — static_analysis_agent
- **Role:** Upgrade PM4Py/Python static detection without executing Python.
- **Owned files:**
  - `crates/pm4py-lsp/src/analysis.rs`
  - `crates/pm4py-lsp/src/lib.rs` (module registration only)
  - `crates/pm4py-lsp/tests/static_analysis_test.rs`
- **Tasks:**
  1. Extract current scan into analysis module.
  2. Support import forms (`import pm4py`, `import pm4py as pm`, `from pm4py import ...`).
  3. Support pandas aliases (`import pandas as pd`, `import pandas`, `pd.read_csv`, `pandas.read_csv`).
  4. Detect DataFrame variables loaded from CSV.
  5. Detect format_dataframe calls with aliases.
  6. Detect PM4Py discovery calls (inductive, dfg, etc.).
  7. Return a typed `PipelineFacts` struct containing facts and aliases.

### AGENT 4 — diagnostic_agent
- **Role:** Implement diagnostic families from static facts.
- **Owned files:**
  - `crates/pm4py-lsp/src/diagnostics.rs`
  - `crates/pm4py-lsp/src/lib.rs` (module registration only)
  - `crates/pm4py-lsp/tests/diagnostics_test.rs`
- **Tasks:**
  1. Implement diagnostics for: `pm4py.py.unformatted_dataframe`, `pm4py.py.missing_case_id_mapping`, `pm4py.py.missing_activity_mapping`, `pm4py.py.missing_timestamp_mapping`, `pm4py.py.discovery_before_formatting`, `pm4py.py.parity_fixture_missing`, `pm4py.py.unreceipted_output`.
  2. Ensure payload requirements: `source = "pm4py-lsp"`, exact diagnostic code, best known source range, actionable message, severity from law axis.

### AGENT 5 — lsp_lifecycle_agent
- **Role:** Validate real LSP lifecycle: initialize, didOpen, didChange, diagnostics refresh.
- **Owned files:**
  - `crates/pm4py-lsp/src/server.rs`
  - `crates/pm4py-lsp/src/lib.rs` (module registration only)
  - `crates/pm4py-lsp/tests/lsp_lifecycle_test.rs`
- **Tasks:**
  1. Ensure initialize advertises text document sync, code action provider, execute command provider, diagnostic support.
  2. Implement `didOpen` (store document, analyze, publish diagnostics).
  3. Implement `didChange` (update document, re-analyze, publish diagnostics).
  4. Implement `didClose` (clear tracked state, publish empty diagnostics).

### AGENT 6 — code_action_command_agent
- **Role:** Implement actual code actions and executeCommand repairs.
- **Owned files:**
  - `crates/pm4py-lsp/src/actions.rs`
  - `crates/pm4py-lsp/src/commands.rs`
  - `crates/pm4py-lsp/src/lib.rs` (module registration only)
  - `crates/pm4py-lsp/tests/actions_commands_test.rs`
- **Tasks:**
  1. Implement `codeAction` for `pm4py.py.unformatted_dataframe`.
  2. Implement commands: `pm4py-lsp.formatDataFrame`, `pm4py-lsp.createParityFixture`, `pm4py-lsp.generateReceipt`, `pm4py-lsp.explainPipelineState`.
  3. Ensure command validation, workspace edit application, and receipt persistence.

### AGENT 7 — receipt_fixture_agent
- **Role:** Deterministic snapshots, persisted parity fixtures, persisted receipts, reload verification.
- **Owned files:**
  - `crates/pm4py-lsp/src/receipts.rs`
  - `crates/pm4py-lsp/src/fixtures.rs`
  - `crates/pm4py-lsp/tests/receipts_fixtures_test.rs`
- **Tasks:**
  1. Replace UUID snapshot with deterministic snapshot hash (`pm4py-snap-<blake3>`).
  2. Persist parity fixture and receipt under JSON formats to disk.
  3. Implement reload tests for fixtures and receipts.
  4. Implement `verify_receipt_file` function.

### AGENT 8 — pm4py_runtime_agent
- **Role:** Optional gated PM4Py execution bridge.
- **Owned files:**
  - `crates/pm4py-lsp/src/pm4py_bridge.rs`
  - `crates/pm4py-lsp/tests/pm4py_bridge_test.rs`
  - `docs/reports/pm4py-lsp-agent-reports/pm4py_runtime.md`
- **Tasks:**
  1. Implement capability-gated bridge (static mode default, runtime mode explicit only).
  2. Safely handle Python/PM4Py import unavailability without panics (return Unknown/Refused).

### AGENT 9 — wasm4pm_parity_agent
- **Role:** Define parity fixture contract for wasm4pm without implementing crown engine.
- **Owned files:**
  - `crates/pm4py-lsp/src/parity.rs`
  - `crates/pm4py-lsp/tests/parity_contract_test.rs`
  - `docs/checkpoints/WASM4PM-PARITY-001.md`
  - `docs/reports/pm4py-lsp-agent-reports/wasm4pm_parity.md`
- **Tasks:**
  1. Define Rust models for equivalence contract (equivalence kinds: `exact_json`, `dfg_equivalence`, etc.; parity verdict enum).
  2. Implement `classify_parity_gap(pm4py_artifact, wasm4pm_artifact, equivalence_kind)`.
  3. Add parity contract tests.

### AGENT 10 — verifier_agent
- **Role:** Sole owner of cargo validation, final verdict, and checkpoint admission.
- **Owned files:**
  - `docs/reports/pm4py-lsp-agent-reports/VERIFICATION.md`
  - `docs/checkpoints/PM4PY-LSP-002.md` (final)
- **Tasks:**
  1. Perform `cargo fmt`, `cargo check`, and `cargo test` checks.
  2. Validate boundary and gates compliance.
  3. Emit final verdict: `PM4PY-LSP-002_ALIVE`, `PARTIAL`, `BLOCKED`, or `BUILD_BROKEN`.

## Global Swarm Rules
- Only `verifier_agent` may run workspace-wide cargo commands.
- Other agents may run file-local inspections, unit-test planning, grep, and targeted reads.
- No agent may run global cargo test/check except `verifier_agent`.
- No agent may modify max/tower-lsp-max core unless explicitly routed through `boundary_agent` and `verifier_agent`.
- No agent may claim ALIVE. Only `verifier_agent` may emit ALIVE/PARTIAL/BLOCKED verdict.
- All agents must leave receipts in `docs/reports/pm4py-lsp-agent-reports/`.
- Every changed surface must have a test or an explicit refusal note.
- Do not delete or weaken existing tests.
- Do not silently accept Unknown as Admitted. Unknown, Refused, and Admitted remain distinct.

## Combinatorial Maximalism Rule
Cross multiply:
Python source patterns
× PM4Py import patterns
× pandas aliases
× CSV/log loading patterns
× formatting/mapping patterns
× discovery calls
× conformance calls
× export calls
× LSP lifecycle events
× diagnostics
× code actions
× executeCommand
× persisted fixtures
× persisted receipts
× wasm4pm parity targets
× docs checkpoint claims
Then implement the smallest bounded working set that makes the cross-product visible, tested, and receipted.

## Acceptance Criteria
- [ ] G1. `cargo check -p pm4py-lsp` passes.
- [ ] G2. `cargo test -p pm4py-lsp` passes.
- [ ] G3. Snapshot is deterministic and covered by test.
- [ ] G4. Fixture is persisted and reload-tested.
- [ ] G5. Receipt is persisted and reload-tested.
- [ ] G6. didOpen/didChange LSP lifecycle is tested.
- [ ] G7. codeAction is tested through LSP-facing API.
- [ ] G8. executeCommand applies edit and returns receipt.
- [ ] G9. malformed command args refuse safely.
- [ ] G10. conformance vector distinguishes Admitted/Refused/Unknown.
- [ ] G11. PM4Py runtime is optional and safe if unavailable.
- [ ] G12. wasm4pm parity fixture contract exists.
- [ ] G13. max core remains PM4Py-free.
- [ ] G14. PM4PY-LSP-001 is corrected to PARTIAL_ALIVE if it currently overclaims.
- [ ] G15. PM4PY-LSP-002 doc states admitted and non-admitted surfaces exactly.

## Follow-up — 2026-06-05T07:50:55Z

MISSION
You are a 10-agent Definition-of-Done swarm operating inside ~/wasm4pm.

Your job is not merely to implement pm4py-lsp.
Your job is to prove whether pm4py-lsp is DONE.

Use combinatorial maximalism:
cross-multiply every already-present surface and force each one to produce evidence.

PM4PY-LSP-003 Test Doctrine:
PM4PY-LSP-003_ALIVE = pm4py-lsp is validated across unit, integration, e2e, chaos, stress, and benchmark gates for the first bounded PM4Py workflow surface.

The bounded surface is:
Python PM4Py workflow:
  import pm4py
  pandas read_csv
  format_dataframe requirement
  discovery call
  fixture generation
  receipt generation
  conformance-vector shift

## 1. Unit tests
Unit tests prove local functions are correct without LSP transport.
Scope:
analysis.rs, diagnostics.rs, fixtures.rs, receipts.rs, parity.rs, pm4py_bridge.rs
Required unit gates:
U1. detect import pm4py
U2. detect import pm4py as pm
U3. detect from pm4py import ...
U4. detect pandas aliases
U5. detect read_csv variables
U6. detect format_dataframe variables
U7. detect discovery calls
U8. detect missing mappings
U9. generate deterministic snapshot from identical input
U10. snapshot changes when document changes
U11. generate fixture payload
U12. persist/reload fixture
U13. persist/reload receipt
U14. corrupt receipt refuses
U15. parity exact match admits
U16. parity mismatch refuses
U17. unsupported parity is Unsupported, not Refused
U18. PM4Py unavailable returns Unknown/Refused, not panic

Command:
cargo test -p pm4py-lsp --test static_analysis_test
cargo test -p pm4py-lsp --test diagnostics_test
cargo test -p pm4py-lsp --test receipts_fixtures_test
cargo test -p pm4py-lsp --test parity_contract_test
cargo test -p pm4py-lsp --test pm4py_bridge_test

## 2. Integration tests
Integration tests prove internal modules work together.
Scope:
analysis → diagnostics
diagnostics → code actions
code actions → commands
commands → receipts
commands → fixtures
snapshot → conformance vector

Required integration gates:
I1. unformatted DataFrame produces diagnostic
I2. format_dataframe repair clears only related diagnostic
I3. missing mapping diagnostics remain after formatting
I4. createParityFixture writes fixture
I5. generateReceipt writes receipt
I6. command receipt hash verifies
I7. conformance vector moves Refused → Admitted after repair
I8. Unknown law axis remains Unknown
I9. malformed command args refuse safely
I10. repeated command is idempotent or safely refused

Command:
cargo test -p pm4py-lsp --test capability_test
cargo test -p pm4py-lsp --test actions_commands_test

## 3. E2E tests
E2E tests prove real LSP behavior, not helper calls.
Scope:
initialize, didOpen, publish diagnostics / diagnostic cache, codeAction, executeCommand, didChange, conformance vector, receipt lookup, didClose
Required E2E scenario:
1. Start pm4py-lsp through max service harness.
2. initialize.
3. didOpen Python file with PM4Py + unformatted read_csv.
4. Verify diagnostic appears.
5. Request codeAction.
6. Execute formatDataFrame command.
7. Verify WorkspaceEdit applied.
8. Verify receipt returned and persisted.
9. didChange with repaired content.
10. Verify diagnostic clears through lifecycle.
11. Verify conformance vector is Admitted for formatting law.
12. didClose.
13. Verify document state clears/deactivates.

Command:
cargo test -p pm4py-lsp --test lsp_lifecycle_test
cargo test -p pm4py-lsp --test e2e_lsp_test
Add: crates/pm4py-lsp/tests/e2e_lsp_test.rs

## 4. Chaos tests
Chaos tests prove refusal discipline under malformed, adversarial, partial, and corrupted state.
Scope:
bad Python text, partial edits, malformed JSON-RPC, missing command args, corrupted fixture, corrupted receipt, unknown PM4Py alias, file deleted mid-command, duplicate document open, concurrent didChange, receipt tampering
Required chaos gates:
C1. malformed Python never panics
C2. malformed command args return error/refusal
C3. corrupted receipt refuses
C4. corrupted fixture refuses
C5. missing fixture produces diagnostic, not panic
C6. unknown import alias records Unknown
C7. concurrent didChange does not poison state
C8. didClose during command does not panic
C9. duplicate command does not double-admit
C10. PM4Py runtime unavailable does not fail tests
C11. invalid URI refuses safely
C12. invalid JSON-RPC request produces protocol error

Command:
cargo test -p pm4py-lsp --test chaos_test
Add: crates/pm4py-lsp/tests/chaos_test.rs

## 5. Stress tests
Stress tests prove the system holds under scale and repetition.
Scope:
many documents, large Python files, many diagnostics, many receipts, many fixtures, repeated didChange, parallel requests, long-running runtime bridge refusal
Required stress gates:
S1. 1,000 PM4Py-like files analyzed without panic
S2. 10,000 read_csv lines analyzed within bounded time
S3. 1,000 receipts generated and verified
S4. 1,000 fixtures generated and reloaded
S5. 100 concurrent didChange events stabilize
S6. repeated conformance queries are stable
S7. memory does not grow unbounded after didClose
S8. no deadlock under parallel codeAction + executeCommand

Command:
cargo test -p pm4py-lsp --test stress_test -- --ignored
Mark expensive tests as ignored by default: #[ignore = "stress gate"]

## 6. Benchmarks
Benchmarks prove performance class.
Benchmark dimensions:
B1. static analysis throughput
B2. diagnostic generation latency
B3. snapshot hash latency
B4. fixture write latency
B5. receipt verify latency
B6. codeAction latency
B7. conformance vector latency
B8. E2E didOpen → diagnostics latency

Crate: criterion = "0.5" in dev-dependencies.
Bench files:
crates/pm4py-lsp/benches/analysis_bench.rs, diagnostics_bench.rs, receipts_bench.rs, lsp_flow_bench.rs
Commands:
cargo bench -p pm4py-lsp
Initial targets:
analysis small file: < 1 ms
analysis 10k-line file: < 50 ms
diagnostics small file: < 1 ms
snapshot generation: < 5 ms
receipt verify: < 5 ms
codeAction generation: < 5 ms

## 7. Final verifier gate
The verifier must produce docs/reports/pm4py-lsp-dod/FINAL-VERDICT.md with:
Gate | Command / Evidence | Verdict
Clippy, Fmt, Boundary, Unit, Integration, E2E, Chaos, Stress, Bench.

## 10-agent hyperprompt addendum
Agent 01 — unit_test_agent
Agent 02 — integration_test_agent
Agent 03 — e2e_lsp_agent
Agent 04 — chaos_agent
Agent 05 — stress_agent
Agent 06 — benchmark_agent
Agent 07 — boundary_agent
Agent 08 — receipt_evidence_agent
Agent 09 — docs_checkpoint_agent
Agent 10 — verifier_agent

Definition of Done Checklist:
- cargo fmt --check -p pm4py-lsp PASS
- cargo clippy -p pm4py-lsp --all-targets -- -D warnings PASS
- cargo test -p pm4py-lsp PASS
- cargo test -p pm4py-lsp --test chaos_test PASS
- cargo test -p pm4py-lsp --test e2e_lsp_test PASS
- stress tests either PASS or explicitly SKIPPED with reason
- cargo bench -p pm4py-lsp either PASS or explicitly SKIPPED with reason
- max purity scan PASS
- FINAL-VERDICT.md written


