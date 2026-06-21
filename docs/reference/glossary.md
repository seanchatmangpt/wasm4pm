# Glossary

Canonical terms for wasm4pm. When a term appears in code, CLI output, or receipts, use the definition here.

---

## Process Mining Concepts

**Event log**
A structured record of activities that happened in a process. Each event has at minimum: a case identifier, an activity name, and a timestamp. Stored as XES (case-centric) or OCEL 2.0 JSON (object-centric).

**XES (eXtensible Event Stream)**
The IEEE standard format for case-centric event logs. Each trace represents one case; each event within a trace belongs to that case only. File extension: `.xes`. Supported by all 60 algorithms unless noted otherwise.

**OCEL 2.0 (Object-Centric Event Log)**
The successor to XES for processes involving multiple interacting objects. Each event can reference multiple objects of multiple types simultaneously. Required input for all `ocel_*` algorithms. See [Truex OCEL 2.0 Canonical Profile](../truex-ocel2-canonical-profile.md).

**DFG (Directly-Follows Graph)**
A graph where nodes are activities and edges represent "activity A was directly followed by activity B" in at least one trace. The simplest and fastest process representation. Default discovery algorithm: `simd_streaming_dfg`.

**Petri net**
A formal process model with places (conditions), transitions (activities), and tokens (case state). Supports formal analysis of soundness, deadlocks, and reachability. Produced by `inductive_miner`, `ilp_miner`, `alpha_miner`.

**WF-net (Workflow net)**
A Petri net with a single source place (case start) and single sink place (case end). The standard model for workflow conformance checking in pm4py and wasm4pm.

**POWL (Partially Ordered Workflow Language)**
A process model combining sequential, choice, loop, and parallel constructs with a strict partial order over them. More expressive than DFG, less verbose than Petri nets. Produced by `powl_miner`.

**Alignment**
An optimal matching between a log trace and a model trace that minimizes the edit distance (number of moves on log or model). Used by `alignment_conformance` and `token_replay_conformance` for fitness scoring.

**Conformance checking**
Determining how well an event log fits a process model. Two main techniques: token-based replay (fast, approximate) and alignment-based (exact, expensive).

**Replay fitness**
The fraction of cases that can be replayed through a model without missing tokens (token-based) or with zero deviations (alignment-based). Range [0, 1]. Admission threshold in wasm4pm: > 0.85.

**Fitness / Precision / Simplicity / Generalization**
The four quality dimensions of a process model (van der Aalst, 2016). `wpm quality` computes all four. See [Process Mining Primer](../explanation/process-mining-primer.md) for definitions.

---

## wasm4pm System Terms

**Algorithm**
A registered process mining computation in the kernel. Each algorithm has a unique ID (e.g., `simd_streaming_dfg`), CLI aliases (e.g., `dfg`), an input type (XES or OCEL), and quality tradeoffs. 60 algorithms are registered. List: `wpm algorithms`.

**Kernel**
`packages/kernel` — the versioned API boundary between the CLI and the WASM core. Handles algorithm dispatch, receipt hashing, and alias resolution. All CLI algorithm calls go through `Kernel.discover()` or `Kernel.run()`.

**Dispatch**
The act of routing a CLI call to a specific registered algorithm in the WASM binary. Dispatch goes through `packages/kernel/src/api.ts` — direct WASM calls from the CLI are forbidden.

**Admission**
A released algorithm has "admitted" status — it passed all positive, negative, and invariant evidence gates in the release certificate. An algorithm that has not passed all gates is not admitted.

**Invariant**
A property that must hold across all inputs for a given algorithm. Invariants are tested as part of release evidence. Example: `simd_streaming_dfg` invariant — output node count equals unique activity count in input.

**Receipt**
A BLAKE3-chained record emitted after every `wpm run` or `wpm cognition run`. Stored in `.wasm4pm/receipts/`. Contains: `input_hash`, `output_hash`, `algorithm_id`, `git_commit`, `timestamp`, `schema_version`. Immutable once written.

**BLAKE3**
A cryptographic hash function used throughout wasm4pm for receipt integrity. Faster than SHA-256 and SHA-3 while providing equivalent security. All hashes in receipts and Truex envelopes use BLAKE3.

**output_hash**
The BLAKE3 hash of an algorithm's output. Present on all `ContractResult` objects and CLI receipts. The authoritative field name — never `hash`, never `digest`.

**run_id**
A unique execution identifier emitted with every cognition run. Links `ContractResult` output to the corresponding receipt file in `.wasm4pm/receipts/`.

**replay_pointer**
The first 16 hex characters of `output_hash`. Used as a short reference in logs and display. `replay_pointer === output_hash.slice(0, 16)`.

**trace_id**
A 32-character hex string identifying an OTEL trace. Required field on all `Receipt` objects (`schema_version: '1.1'`).

---

## Cognition Layer Terms

**Breed**
A cognition algorithm implementing a specific historical or formal AI architecture. 52 breeds are PARTIAL_ALIVE, registered in `crates/wasm4pm-cognition/src/breeds/registration.rs`. Examples include `mycin`, `dempster_shafer`, `ebl`, `episodic_memory`, `script_sam`, `ltl_monitor`, `eliza`, `strips`, `prolog`, `cbr`, `dendral`, `gps`, `soar`, `hearsay`, and many others spanning symbolic AI, probabilistic reasoning, planning, and temporal logic. Full list: `wpm cognition breeds`.

**Old AI**
The symbolic AI systems from the 1960s–1990s implemented as native Rust breeds in `crates/wasm4pm-cognition/src/breeds/`. Each implements the `CognitionBreed` trait. Includes `eliza`, `mycin`, `strips`, `prolog`, `cbr`, `dendral`, `gps`, `soar`, `hearsay`, and extended symbolic breeds such as `asp`, `abductive_ibe`, `dempster_shafer`, `ebl`, `episodic_memory`, `script_sam`, `ltl_monitor`, and others.

**Autoinstinct**
The 4 adaptive instinct breeds added alongside the symbolic AI substrate: `autoinstinct_learning`, `autoinstinct_neurosis`, `autoinstinct_semantics`, `autoinstinct_vision`.

**Contract**
The structured input to a cognition run. All breeds share a common `BreedInput` contract with fields: `intent`, `candidates`, `facts`, `cases`, `rules`, `goals`, `state`. Wrapped in `{ "breed": "<id>", "contract": { ... } }` for the WASM boundary.

**ContractResult**
The output shape returned by every breed: `{ status, breed, run_id, output_hash, replay_pointer, options_profile, output }`. Source of truth: `crates/wasm4pm-cognition/src/wasm.rs` lines 182–190. See [cognition-contracts.md](../../.claude/rules/cognition-contracts.md) for the full field law.

**Rule struct**
The shared rule type used by all breeds: `{ id: string, premise: string[], conclusion: string, certainty: f32 }`. `certainty` is required — no serde default.

---

## Deployment Terms

**Profile**
A WASM build variant optimized for a deployment environment. Five profiles: `mobile`, `iot`, `edge`, `fog`, `browser`. All compile to the same algorithm set; they differ by feature-gated subsets and build flags. Default: `browser`.

**Feature gate**
A Rust `#[cfg(feature = "...")]` flag that includes or excludes algorithms from a profile build. Controls which of the 60 algorithms are compiled into a given WASM binary.

**Admitted (release)**
An algorithm that has passed all positive, negative, and invariant evidence in a release certificate. Synonymous with "passing" in a release gate context.

**Release certificate**
`RELEASE_CERTIFICATE.v<version>.json` — a JSON document binding all 60 algorithm evidence hashes to the git commit that produced them. Generated by `npm run release:certificate`. Immutable once written.

---

## CLI Terms

**wpm**
The `wasm4pm` CLI binary. Published as `@wasm4pm/cli` (TypeScript, `apps/wasm4pm/`). A secondary Rust binary (`crates/wasm4pm-cli/`) also exists for development but is not published.

**Exit codes**

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Config error — bad flags, missing required argument |
| `2` | Source error — bad algorithm ID, missing WASM module |
| `3` | Execution error — algorithm failed, WASM panic |
| `4` | Partial — some outputs succeeded, some failed |
| `5` | System error — filesystem, OOM, unexpected crash |

**Truex**
The OCEL 2.0 canonicalization and BLAKE3 receipt verification subsystem. `wpm truex verify` checks whether an OCEL 2.0 envelope was produced by an admitted process and has not been tampered with.

**OTEL (OpenTelemetry)**
The observability standard used by wasm4pm for spans and traces. Every public CLI operation emits spans with `service_name` and `status`. OTLP export is opt-in via `WASM4PM_OTEL_ENDPOINT`.
