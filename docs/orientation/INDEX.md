# wasm4pm Master Architecture Index

This index provides a comprehensive map of the `wasm4pm` architecture. It is structured as an **executable orientation substrate** for human and AI agents.

## Diagram Catalog

| Phase | Diagram | Question it answers | Audience | Confidence | File |
|-------|---------|---------------------|----------|------------|------|
| 0 | Repository Inventory | What tech stack and tools are used? | New Developers | High | [00-repo-inventory.md](./00-repo-inventory.md) |
| 1 | C4 System Context | How does wasm4pm fit into the process mining ecosystem? | Stakeholders, Architects | High | [01-c4-system-context.md](./01-c4-system-context.md) |
| 2 | C4 Container | What are the major internal architectural blocks (Rust, WASM, JS)? | Developers, Architects | High | [02-c4-container.md](./02-c4-container.md) |
| 3 | C4 Components | How are features structured internally (Truex, ML, Discovery)? | Developers | High | [03-c4-components.md](./03-c4-components.md) |
| 4 | Code Hotspots | Where is the most complex or risky logic? | Senior Devs, Security | High | [04-code-hotspots.md](./04-code-hotspots.md) |
| 5 | CLI & API Map | How do users and applications interface with wasm4pm? | Developers | High | [05-cli-and-api-map.md](./05-cli-and-api-map.md) |
| 6 | State & Data Flow | How do Event Logs turn into BLAKE3 Receipts? | Architects, Developers | High | [06-state-and-data-flow.md](./06-state-and-data-flow.md) |
| 7 | Evidence & Proof | How does the project enforce Combinatorial Maximalism? | QA, Devs, Audit | High | [07-evidence-and-proof.md](./07-evidence-and-proof.md) |

## Cardinality Report

- **Module Count**: 8 modules (Phase 00–07, reconciled).
- **Index Count**: 1 (INDEX.md).
- **Total Operational Files**: 9.

## Top 10 Proven Facts (High Confidence)

1. **Rust/WASM Core**: The mathematical engine is written in Rust (`crates/wasm4pm-algos` for process-mining algorithms, `crates/wasm4pm-cognition/` for 52 PARTIAL_ALIVE cognitive breeds) and exposed via `wasm-bindgen` (`wasm4pm/src/lib.rs`).
2. **Truex Native Trust Layer**: App-state mutation is cryptographically bound into Truex OCEL 2.0 Receipts using BLAKE3 hashing.
3. **Semantic Equivalence (Profile V1)**: Truex evaluates payloads for operational equivalence rather than byte-for-byte serialization equality.
4. **Strict Refusal Taxonomy**: Invalid execution paths do not return generic errors; they return strict enums like `ReceiptForged` or `CanonicalizationMismatch`.
5. **Combinatorial Maximalism**: Release certificates bind all evidence hashes to the current git commit to prevent receipt theater.
6. **Zero Suppression Rule**: The Rust codebase enforces zero Clippy warnings or attributes.
7. **Cross-Tool Parity Foundation**: Truex canonical digests guarantee cross-language parity (Rust4PM, PM4Py, PM4JS).
8. **TypeScript SDK boundary**: The WASM complexity is fully encapsulated by a strongly typed SDK (`packages/kernel`).
9. **Universal Deployment Profile**: The system supports Edge, Browser, Mobile, and Node.js environments via targeted WASM compilation profiles.
10. **OTLP Embedded Instrumentation**: The execution engine emits JSON lines spans compatible with the OpenTelemetry OTLP standard.

## Top 5 Inferred Facts (Medium Confidence)

1. **PostHog Integration**: INFERRED that telemetry flows reliably through to PostHog from the native JS boundary.
2. **Memory Bounds**: INFERRED that the WASM allocation (`wasm-bindgen`) will safely handle log batches up to 500MB without OOM errors on standard Node hosts.
3. **Parallel Iterators**: INFERRED that BLAKE3 parallelism significantly reduces runtime latency during massive canonicalizations.
4. **PM4Py Bridge Parity**: INFERRED that the Python interoperability bridge correctly outputs matching BLAKE3 digests.
5. **Dependency Sprawl**: INFERRED that the workspace `pnpm` monorepo structure minimizes duplicate resolution conflicts.

## Top 5 Unknowns

1. **WASI Support Status**: The level of compatibility with pure WASI (outside of the V8/Node JS bridge) is UNKNOWN.
2. **Max Batch Thresholds**: The absolute threshold where `truex verify` drops below sub-50ms latency is UNKNOWN.
3. **React Native Safari Limits**: iOS Safari constraints on WebAssembly memory limits for the mobile execution profile are UNKNOWN.
4. **Cognition Breed Roadmap**: How the 52 PARTIAL_ALIVE breeds (MYCIN, Dempster-Shafer, EBL, Episodic Memory, Script-SAM, LTL Monitor, and others) will be promoted to ALIVE and integrated with process execution modeling is UNKNOWN.
5. **App Store Validation**: How Truex signatures hold up under iOS Native App review context is UNKNOWN.

## Recommended Read Order

1. **00-repo-inventory.md**: Get oriented with the Monorepo.
2. **02-c4-container.md**: Understand the Rust/WASM/JS layer boundaries.
3. **06-state-and-data-flow.md**: Learn how Truex canonicalization guarantees trust.
4. **07-evidence-and-proof.md**: Understand the Combinatorial Maximalism release discipline.
