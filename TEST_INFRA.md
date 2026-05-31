# TEST_INFRA.md — E2E Test Infrastructure

## 1. Test Philosophy
The `wasm4pm` E2E test framework is built around an **opaque-box, requirement-driven testing philosophy**. By executing the compiled Command Line Interface (CLI) in isolated environments, we guarantee that user-facing behaviors, exit boundaries, and output contracts are strictly enforced without relying on the internal state or mocks of the TypeScript and WASM components. 

To ensure complete verification across all boundaries, we employ four distinct software testing methodologies:
1. **Category-Partition Testing**: Decomposing feature specifications into functional categories (e.g., input flags, output formats, precision modes) and partitioning their inputs to target specific code paths.
2. **Boundary Value Analysis (BVA)**: Challenging numerical limits (e.g., threshold values exactly at `0.0`, `1.0`, or out of bounds like `-0.1` and `1.5`) and trace lengths (empty logs, single-event traces, or extremely long event streams).
3. **Pairwise Testing**: Combining option parameters (e.g., streaming mode coupled with different precision modes and output formats) to explore interaction defects efficiently.
4. **Workload Testing**: Validating system behavior under non-trivial stress inputs, such as massive sequential traces and complex queries evaluated against high-cardinality Object-Centric Event Logs.

---

## 2. Feature Inventory
The E2E test suite covers five critical functional features:

*   **F1: Streaming Conformance Checking**
    *   Validation of log fitness and precision in real-time.
    *   Processing logs via `--stream` or `--ndjson` formats.
    *   Dynamic performance configurations (fast, lazy, and full precision modes).
*   **F2: Prefix Conformance**
    *   Detection of impossible/illegal prefixes.
    *   Evaluation of partial trace suffixes to output trace status reports (`ALIVE`, `FAKE-LIVE`, or `BLOCKED`).
*   **F3: Process-Model Registry**
    *   Save and retrieve Petri Nets and process models.
    *   Metadata exports to PNML/JSON/CSV formats.
    *   LRU caching validation and SemVer range checks for stored models.
*   **F4: Object-Centric Causality**
    *   Ingesting event logs to analyze process variants and trace graphs.
    *   Verification of OCEL 2.0 object lifecycles, monotonicity invariants, and referential integrity.
*   **F5: Process-Law Query Language (OCPQ)**
    *   Grammatical verification of OCPQ query strings.
    *   Evaluating temporal precedence constraints (`BEFORE`, `AFTER`, `IMMEDIATELY`) under global and local object scopes.

---

## 3. Test Architecture
The test framework is built on a modern TypeScript stack to ensure reproducibility and runtime isolation.

```
                  ┌──────────────────────────────┐
                  │        Vitest Runner         │
                  └──────────────┬───────────────┘
                                 │ Spawns
                                 ▼
                  ┌──────────────────────────────┐
                  │    @wasm4pm/testing Harness  │
                  └──────────────┬───────────────┘
                                 │ runCli Exec
                                 ▼
         ┌────────────────────────────────────────────────┐
         │              Built wpm CLI Binary             │
         │  (apps/wasm4pm/dist/bin/wpm.js in Node.js)   │
         └──────────────┬──────────────────┬──────────────┘
                        │                  │
                        ▼                  ▼
             ┌────────────────────┐   ┌──────────────┐
             │  WASM Engine Core  │   │ File System  │
             └────────────────────┘   └──────────────┘
```

*   **Test Runner**: Vitest is utilized for fast execution, native ESM support, and parallel execution.
*   **CLI Harness**: The `@wasm4pm/testing` package provides `runCli` to invoke the built CLI entry point and `createCliTestEnv` to spin up isolated temporary directories for every test. This avoids cross-test contamination of cached models and receipts.
*   **Absolute Path Safety**: The E2E tests dynamically resolve paths relative to `import.meta.url` to prevent file access issues regardless of which directory the test runner is executed from.
*   **Output Formats**: Validates both user-facing ASCII table formatting (`human` mode) and structured pipelines (`json` / `ndjson` modes) with automatic sanitization of `WasmLoader` log headers.

---

## 4. Real-World Application Scenarios
Tier 4 scenarios exercise end-to-end user workflows matching production environments. This includes the **ggen six-link chain** representing the complete lifecycle:
$$\text{DiagnosticRaised} \rightarrow \text{RouteSelected} \rightarrow \text{RepairAttempted} \rightarrow \text{GatePassed} \rightarrow \text{ReceiptEmitted} \rightarrow \text{ALIVE}$$

*   **S1 (Valid Chain)**: Verifies that the full six-link trace conforms to the `living_diagnostic_clear_v1` Petri net, resulting in `ALIVE`.
*   **S2 (Illegal Skipping)**: Simulates missing steps (e.g., going straight from `RouteSelected` to `ReceiptEmitted`) to ensure the transition is rejected.
*   **S3 (Illegal Action)**: Introduces an unexpected `ILLEGAL` activity at a disallowed state, validating that the engine immediately reports a `BLOCKED` transition.
*   **S4 (Terminal Unreachability)**: Simulates a `DEADEND` state where the trace stops prematurely without reaching the sink node, returning `FAKE-LIVE`.
*   **S5 (Full Lifecycle)**: Saves a discovered model into the registry, uses it for stream conformance, and subsequently performs prefix adjudication on it.

---

## 5. Coverage Thresholds
To ensure the test suite is comprehensive and covers both positive paths and strict failure boundaries, the process-law E2E suite enforces the following thresholds:

| Tier | Focus Area | Minimum Cases | Current Count | Status |
|---|---|---|---|---|
| **Tier 1** | Feature Coverage (F1–F5) | 25 | 28 | **Passed** |
| **Tier 2** | Refusal & Error Boundaries | 25 | 28 | **Passed** |
| **Tier 3** | Invariant & Edge Cases | 5 | 5 | **Passed** |
| **Tier 4** | Real-World Application Scenarios | 5 | 5 | **Passed** |
| **Total** | **Global Suite Coverage** | **60** | **66** | **Passed** |
