# Checkpoint: MAX-PURITY-FENCE

## Status: Verified

## Description:
This checkpoint defines the domain-agnostic boundary of the `tower-lsp-max` vendor crate. `tower-lsp-max` is a generic, reusable Language Server Protocol (LSP) extension library that introduces typestate kernel and capability vector abstractions. To maintain architectural modularity and reuse, a strict purity fence is established.

## 1. Domain-Agnostic Interface Boundary
`tower-lsp-max` specifies a set of abstract interfaces for managing LSP lifecycle compliance and custom JSON-RPC methods (`max/*`). These interfaces are designed without knowledge of specific application domains. The core abstractions include:
- **`max_snapshot`**: Computes a deterministic snapshot identifier representing the combined state of active workspace documents.
- **`max_conformance_vector`**: Computes a capability-conformance score based on set of active `LawAxis` rules (e.g., `Protocol`, `Type`, `Security`, `Custom(String)`).
- **`max_receipt`**: Looks up transaction receipts (cryptographic hashes bound to action completions).
- **`max_admission` / `max_refusal`**: Evaluates whether specific state transitions conform to rules, and suggests repair actions.

These interfaces use only standard LSP types and generic JSON-RPC protocol structures.

## 2. Strict Purity Fence Rules
To prevent domain leakage, the following rules are strictly enforced:
1. **Forbidden Semantics**: Absolutely no references to process mining, XES, OCEL, BPMN, Petri nets, POWL, fitness, precision, PM4Py, or `wasm4pm` replay/Gall semantics are permitted inside the `vendors/tower-lsp-max` directory.
2. **Path Isolation**: Directory dependencies must be unidirectional. Crate path dependencies under `vendors/tower-lsp-max` are forbidden from referencing crates inside the main workspace (`crates/*` or `wasm4pm`).
3. **No Domain-Specific LawAxis**: All domain-specific constraints must be evaluated using `LawAxis::Custom(String)` rather than adding static enum variants to the vendor's `LawAxis` definition.

## 3. Durable Vendor Strategy
To keep the vendor crate isolated, versioned, and pure:
- **Monorepo Vendoring**: `vendors/tower-lsp-max` is maintained as a vendored dependency, allowing the monorepo to be fully self-contained and portable.
- **Automated Purity Scans**: An automated CI check is established to scan the vendor folder for any forbidden terms using a ripgrep scan:
  ```bash
  ! rg -i -g "!target/" -g "!.git/" "(pm4py|xes|ocel|bpmn|petri|powl|fitness|precision|wasm4pm)" vendors/tower-lsp-max/
  ```
  Any matching pattern will trigger a build failure.
- **Generic Release Cycle**: Any improvements to `tower-lsp-max` must remain domain-agnostic and qualify for inclusion in a generic LSP library.

## Validation Block
State: Closed
Commit: (Pending manual commit)
Package: tower-lsp-max v0.1.0
Commands Run:
- cargo check (Compiles successfully)
- Purity Scan: Pass (No forbidden terms found)
Artifacts:
- vendors/tower-lsp-max/: Verified Pure

## Next Steps:
- Integrate the automated purity scanner script into the prepublish or CI verification pipeline.
- Implement more extensive generic tests for the typestate runtime in `tower-lsp-max`.
