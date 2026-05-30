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

