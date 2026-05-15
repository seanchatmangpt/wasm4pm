# Validation Plan: Advanced Algorithms & Parsers (Real Data)

## Objective
To rigorously verify that the recently ported advanced algorithms (Alpha+++, OC-DECLARE, OCLA, OC-DFG, OC-PT) and the high-performance parsers (XES, OCEL JSON/XML) are fully functional, robust, and correctly implemented. We will move beyond synthetic tests and validate against complex, real-world process mining datasets.

## 1. Real-World Data Sources

We will utilize industry-standard, publicly available event logs to stress-test the kernel. These logs provide the noise, concurrency, and volume necessary to prove production readiness.

### A. Case-Centric Datasets (For XES Parsers & Alpha+++)
*   **BPI Challenge 2012 (Financial Services):** Contains complex loan application processes with high variability, noise, and concurrency. Ideal for testing Alpha+++ noise filtering and branchless DFG heuristics.
*   **Sepsis Event Log (Healthcare):** A highly unstructured log with complex event typologies. Excellent for testing robust timestamp parsing and attribute extraction.

### B. Object-Centric Datasets (For OCEL Parsers & OC Algorithms)
*   **BPI Challenge 2017 (OCEL Port):** Purchase-to-Pay process involving multiple object types (Orders, Invoices, Receipts). Essential for testing `OC-DFG` flattening and `OCLA` abstraction.
*   **Order Management OCEL 2.0:** A standard OCEL 2.0 dataset featuring qualified relationships (e.g., "created_by", "item_of"). Critical for verifying the new `OCELRelationship` models and `OC-DECLARE` multi-object constraints.

## 2. Validation Methodology

The validation will be executed in three distinct phases: **Ingestion**, **Discovery Verification**, and **Conformance Benchmarking**.

### Phase 1: Ingestion & Parsing Integrity
**Goal:** Prove the new `quick-xml` state-machines and `serde` JSON loaders correctly interpret real-world nuances without crashing or leaking memory.

*   **Test 1.1: XES Spec Compliance:** Load BPI 2012. Verify trace count, event count, and successful extraction of nested extension attributes (e.g., `lifecycle:transition`, `time:timestamp`).
*   **Test 1.2: OCEL 2.0 Integrity:** Load the Order Management OCEL log. Run the newly updated `validate_ocel` function. Ensure 100% referential integrity and zero lifecycle violations (events must strictly follow chronological order per object).
*   **Test 1.3: Parser Fuzzing:** Corrupt sections of the Sepsis XML log (e.g., malformed ISO 8601 strings, unclosed tags). Verify that the parsers fail gracefully with explicit `Result::Err` rather than panicking.

### Phase 2: Algorithm Correctness (Discovery)
**Goal:** Prove that the mathematical logic translated from `process_mining` into branchless WASM structures produces mathematically sound process models.

*   **Test 2.1: Alpha+++ vs Baseline:** Run standard Alpha++ and the new Alpha+++ on the BPI 2012 log. Verify that Alpha+++ successfully filters out low-frequency outlier edges (based on `absolute_df_clean_thresh`) resulting in a more structured, less "spaghetti-like" Petri Net.
*   **Test 2.2: OC-DFG Flattening:** Discover an OC-DFG from the BPI 2017 log. Verify that the sub-DFG for the "Invoice" object type correctly reflects the invoice lifecycle, independent of the "Order" object type.
*   **Test 2.3: OCLA Abstraction:** Generate an Object-Centric Language Abstraction for the Order Management log. Assert that `start_ev_types` and `end_ev_types` perfectly match the empirical first/last events grouped by `object_id`.

### Phase 3: Conformance & Enforcement (OC-DECLARE)
**Goal:** Prove that the declarative engine can enforce complex, multi-object rules at high speeds.

*   **Test 3.1: Rule Discovery:** Run `discover_oc_declare` on the BPI 2017 log with a `noise_threshold` of 0.05. Verify it automatically discovers standard business rules (e.g., "Create Invoice" *Eventually Follows* "Create Order").
*   **Test 3.2: Rule Enforcement (Branchless Validation):** Manually construct a violative trace (e.g., "Pay Invoice" before "Create Order" across different object IDs). Pass this to `check_oc_declare` and assert that the computed confidence score strictly reflects the exact ratio of violations computed via the branchless masking logic.

## 3. Execution Infrastructure

To automate this validation, we will build a dedicated test harness in Rust:

1.  **Dataset Downloader:** A script (`fetch_real_data.sh`) to securely download and cache the BPI and Sepsis logs in the `wasm4pm/bench_data/` directory.
2.  **Rust Integration Tests:** A new suite (`tests/real_world_parity.rs`) utilizing `#[test]` and `#[ignore]` (for long-running downloads) that programmatically executes Phases 1-3.
3.  **CI/CD Gate:** The metrics from these tests will be exported via `proof_pack` to ensure the algorithms never regress in either correctness or nanosecond-scale performance.

## Definition of Done
The implementations are considered "real and working" when:
1. The new parsers successfully ingest the multi-gigabyte BPI logs without memory leaks.
2. Alpha+++ produces a structurally sound, simplified Petri Net from noisy data.
3. OC-DECLARE correctly identifies >95% of standard BPI 2017 business rules with zero false positives on rule violations.