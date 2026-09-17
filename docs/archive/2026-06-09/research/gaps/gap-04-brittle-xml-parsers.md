<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/research/gaps/gap-04-brittle-xml-parsers.md; source-sha256: 31a81f26dbd9e8cdc67f28c9e0c4dbad721a1374e40746a90f5b05e6ef679b9b; reason: tooling or agent control surface -->

# Research: Brittle XML/BPMN Parsers

## Overview
When executing cross-platform integration algorithms (e.g., `bpmn_import`, `powl_to_process_tree`), the underlying WebAssembly bindings fail abruptly when presented with shallow or non-standard XML payloads.

## Analysis
The current WASM parsers for external process modeling languages (BPMN, PNML, YAWL) appear to enforce rigid, undocumented schema depths. Instead of performing safe structural validation and returning descriptive errors to the JavaScript host context, the Rust-side parsers often encounter unexpected node shapes or empty arrays, leading to `undefined` property access errors or silent failures propagated back to the user.

This brittleness undermines the "Sovereign Execution Authority" tenet of the project, as the boundaries between unvalidated external data and the execution engine are not strictly enforced.

## Proposed Architectural Solution
1. **Rust-Side Error Handling:** Rewrite the XML deserialization logic in Rust using robust `Result<T, E>` paradigms. Ensure all tree-traversal unwraps are guarded.
2. **Descriptive WASM Exceptions:** Map Rust-side parsing errors to structured JSON or typed JavaScript exceptions (e.g., `ValidationError: Missing <process> node in BPMN payload`) before returning across the WASM boundary.
3. **Schema Validation Layer:** Introduce an admissibility check layer that validates the shape of imported XML against standardized XSDs prior to attempting graph conversion.