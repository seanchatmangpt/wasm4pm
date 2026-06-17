# wasm4pm Project Gaps Inventory

**Date:** June 11, 2026
**Scope:** Aggregated gap inventory based on all project audit reports and summaries.

---

## 1. Observability Gaps
*Source: `autonomic-observability-gaps-audit.json`*

- **OBS-GAP-1: RL Convergence Invisible**
  - **Issue:** Missing per-cycle TD Error, Q-Value, and Weight Norm metrics in the main cycle span (`rl_orchestrator.rs`).
  - **Impact:** Cannot prove learning mathematically. Violates Rank-1 oracle requirements.
- **OBS-GAP-2: SPC-RL Decoupled**
  - **Issue:** SPC rule type is lost during quantization. The RL agent receives a scalar instead of the rule type.
  - **Impact:** RL policy cannot learn rule-specific recovery actions.
- **OBS-GAP-3: Circuit Breaker → Reward Opaque**
  - **Issue:** Circuit decisions and RL health changes are emitted in separate, uncorrelated spans.
  - **Impact:** Cannot prove causality between circuit recovery and health improvement.

## 2. ML Pipeline Gaps
*Source: `ML_PIPELINE_AUDIT_REPORT.json`*

- **G-ML-001:** Cross-validation results report only aggregate accuracy; missing per-class metrics (precision, recall, F1) for imbalanced datasets.
- **G-ML-002:** Zero-variance and multicollinear features are detected but not automatically removed.
- **G-ML-003:** Algorithm selector uses heuristics but lacks empirical validation against baseline data.
- **G-ML-004:** Parameter suggestion functions use hardcoded heuristics without a grid search / hyperparameter tuning mechanism.
- **G-ML-005:** Feature scaling recommendations lack actual impact validation.
- **G-ML-006:** AutoML envelope extracts features with mixed/unbounded scales without normalization or feature importance ranking.

## 3. Determinism Gaps
*Source: `DETERMINISM_AUDIT_SUMMARY.txt`*

- **Issue 1:** `streaming_dfg.rs` uses `HashMap` for case tracking, leading to non-deterministic iteration order.
- **Issue 2:** `playout.rs` uses unseeded `fastrand`, leading to non-reproducible random traces.
- **Issue 3:** Hardcoded seeds (e.g., `42`) in stochastic algorithms (Genetic, PSO, ACO, SA, A*). The seed is not configurable by the caller, reducing testing flexibility.

## 4. Kernel Registry Gaps
*Source: `KERNEL_AUDIT_SUMMARY.txt`*

- **Name Mismatches:** 15 algorithms have WASM exports that do not match their registry IDs (e.g., `ilp` vs `discover_ilp_petri_net`). This mapping is undocumented.
- **Deployment Profiles Accuracy:** Registry claims algorithms are available in mobile/IoT profiles, but actual availability depends on Cargo feature flags. This causes "algorithm not found" errors in certain builds.
- **Missing Utilities:** 7 low-priority utility algorithms are registered but not exported from WASM (e.g., `smart_engine`, `transition_system`).

## 5. Test Redundancy & Efficiency Gaps
*Source: `AUDIT_SUMMARY.txt`*

- **Massive Redundancy:** 657 test files (~147k LOC). `discover_dfg` is tested in 136 files; CLI `run` is tested 45+ times.
- **Fixture Duplication:** 480+ fixture files resulting in ~300MB of duplicated disk usage.
- **Impact:** Test suites take longer to run and are harder to maintain. Consolidating could reduce files by ~40% and run time by 50%.

## 6. Backward Compatibility Gaps
*Source: `BACKWARD_COMPAT_SUMMARY.txt`*

- **JSON Output Envelope Breaking Change:** The new `parsePayload()` wrapper changes JSON output from a flat structure to a wrapped structure (`{ payload: {...}, meta: {...} }`).
- **Impact:** Breaks external `jq` scripts, lab tests, and documented API contracts silently. Requires a phased rollout and a migration guide.

## 7. Security & Code Standard Gaps
*Source: `findings.json` & `TRACK_B1_FINDINGS.txt`*

- **Short Hashes in Mock Receipts:** 90 instances where tests assign short strings (e.g., "abc123") to BLAKE3 hash fields, violating the 64-char requirement.
- **Non-deterministic RNG in Production:** `Math.random()` is used instead of a cryptographic or seeded PRNG in `cross-validation.ts`, `feature-importance.ts`, and `error-span-capture.ts`.
- **Trace Conformance Command Fix Required:** 9 failing tests due to `trace conform` not outputting valid JSON to stdout when required.
