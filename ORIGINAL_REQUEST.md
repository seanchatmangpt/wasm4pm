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
