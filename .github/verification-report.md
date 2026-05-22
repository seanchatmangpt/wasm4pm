# Release Verification Report

Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
Git Commit: $(git rev-parse --short HEAD)

## Verification Status

---
### Gate 1: All Tests Pass
✗ **Tests failed - see logs**
 FAIL  __tests__/integration/phase3-e2e.test.ts > Phase 3: End-to-End Integration Tests > Comprehensive End-to-End Scenarios > with error recovery
 FAIL  __tests__/integration/phase3-e2e.test.ts > Phase 3: End-to-End Integration Tests > Comprehensive End-to-End Scenarios > with output generation
 FAIL  __tests__/integration/phase3-e2e.test.ts > Phase 3: End-to-End Integration Tests > Comprehensive End-to-End Scenarios > with receipt generation
 FAIL  __tests__/prediction/bench.test.ts > predict_next_activity > sample — structure, probability sum ≤1, and 1k latency
 FAIL  __tests__/prediction/bench.test.ts > predict_next_activity > BPI 2020 — single-step prediction
 FAIL  __tests__/prediction/bench.test.ts > score_trace_likelihood > sample — negative log-probability, normal > anomalous, and 1k latency
 FAIL  __tests__/prediction/bench.test.ts > score_trace_likelihood > BPI 2020 — score a known process sequence
 FAIL  __tests__/prediction/bench.test.ts > predict_next_k > sample — top-3 structure and 1k latency
 FAIL  __tests__/prediction/bench.test.ts > predict_next_k > BPI 2020 — 1 000 calls throughput
 FAIL  __tests__/prediction/bench.test.ts > predict_beam_paths > sample — beam=3 steps=4, paths sorted by probability
 FAIL  __tests__/prediction/bench.test.ts > predict_beam_paths > BPI 2020 — beam=5 steps=5
 FAIL  __tests__/prediction/bench.test.ts > build_remaining_time_model > sample — build latency
 FAIL  __tests__/prediction/bench.test.ts > build_remaining_time_model > BPI 2020 — build latency
 FAIL  __tests__/prediction/bench.test.ts > predict_case_duration > sample — two-activity prefix and 1k latency
 FAIL  __tests__/prediction/bench.test.ts > predict_case_duration > BPI 2020 — real prefix remaining time
 FAIL  __tests__/prediction/bench.test.ts > predict_hazard_rate > sample — Weibull h(t) at 2h elapsed and 1k latency
 FAIL  __tests__/prediction/bench.test.ts > score_anomaly > sample — normal trace [0,1], all-missing-edges trace is anomalous, and 1k latency
 FAIL  __tests__/prediction/bench.test.ts > score_anomaly > BPI 2020 — known good sequence scores in [0,1]
 FAIL  __tests__/prediction/bench.test.ts > compute_boundary_coverage > sample — prefix [Request, Review], empty prefix, and no-match prefix
 FAIL  __tests__/prediction/bench.test.ts > compute_boundary_coverage > BPI 2020 — single-activity prefix
 FAIL  __tests__/prediction/bench.test.ts > compute_trace_likelihood > sample — negative ll, normal > anomalous, and 1k latency
 FAIL  __tests__/prediction/bench.test.ts > detect_drift > sample — window=2 has required properties
 FAIL  __tests__/prediction/bench.test.ts > detect_drift > BPI 2020 — window=50 and window=100
 FAIL  __tests__/prediction/bench.test.ts > build_transition_probabilities > sample — probabilities sum to 1 per source
 FAIL  __tests__/prediction/bench.test.ts > build_transition_probabilities > BPI 2020 — large graph
 FAIL  __tests__/types/types.test.ts > Type Wrapper - WasmEventLog > should create WasmEventLog, expose event_count/case_count/stats, and throw on invalid handle
 FAIL  __tests__/state/state.test.ts > State Management - Object Storage > should store EventLog and OCEL with valid unique handles, and track object count
 FAIL  __tests__/state/state.test.ts > State Management - Object Deletion > should delete by handle, return false for non-existent, and fail on deleted handle
 FAIL  __tests__/state/state.test.ts > State Management - Clear All Objects > should clear all objects and work on empty state
 FAIL  __tests__/workflow/workflow.test.ts > Process Mining WASM - Integration Tests > should initialize, load XES, track state, analyze, discover DFG, export, and list algorithms
 FAIL  __tests__/workflow/workflow.test.ts > Streaming Conformance > should detect conforming and non-conforming traces, report stats, and finalize with summary
RuntimeError: unreachable
 ❯ __rustc[b7974e8690430dd9]::__rust_abort wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:2083722
 ❯ __rustc[b7974e8690430dd9]::__rust_start_panic wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:2083601
 ❯ __rustc[b7974e8690430dd9]::rust_panic wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:2076629
 ❯ std[a543996e6e7dbf1e]::panicking::panic_with_hook wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:1534810
 ❯ std[a543996e6e7dbf1e]::panicking::panic_handler::{closure#0} wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:1765491
 ❯ std[a543996e6e7dbf1e]::sys::backtrace::__rust_end_short_backtrace::<std[a543996e6e7dbf1e]::panicking::panic_handler::{closure#0}, !> wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:2083095
 ❯ __rustc[b7974e8690430dd9]::rust_begin_unwind wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:2033500
 ❯ core[c5930c85a12de822]::panicking::panic_fmt wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:1975450
 ❯ core[c5930c85a12de822]::result::unwrap_failed wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:1851564
 ❯ wasm4pm::xes_format::load_eventlog_from_xes::h4a5d63be457726d5 wasm:/wasm/wasm4pm.wasm-00b7a8e6:1:837964

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/147]⎯

 Test Files  11 failed | 6 passed | 2 skipped (19)
      Tests  147 failed | 154 passed | 54 skipped (355)
   Start at  17:26:07
   Duration  9.96s (transform 1.02s, setup 294ms, collect 2.45s, tests 13.66s, environment 2ms, prepare 2.04s)

---
### Gate 2: Code Coverage (>70%)
⚠ **Coverage report generation failed (continuing)**
---
### Gate 3: TypeScript Type Checking
✓ **No TypeScript errors**
---
### Gate 4: Rust Code Quality (Clippy)
⚠ **Clippy warnings (continuing):**
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.95.0/index.html#if_same_then_else
   = note: `-D clippy::if-same-then-else` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::if_same_then_else)]`

error: writing `&mut Vec` instead of `&mut [_]` involves a new object where a slice will do
   --> crates/wasm4pm-types/src/import/xes/stream_xes.rs:295:36
    |
295 |         current_nested_attributes: &mut Vec<Attribute>,
    |                                    ^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.95.0/index.html#ptr_arg
    = note: `-D clippy::ptr-arg` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::ptr_arg)]`
help: change this to
    |
295 -         current_nested_attributes: &mut Vec<Attribute>,
295 +         current_nested_attributes: &mut [Attribute],
    |

error: could not compile `wasm4pm-types` (lib) due to 7 previous errors
---
### Gate 5: Code Formatting
✓ **Code is properly formatted (Prettier)**
---
### Gate 6: Security Audit (cargo audit)
⚠ **Security audit output:**
     Locking 0 packages to latest compatible versions
note: pass `--verbose` to see 64 unchanged dependencies behind latest
    Fetching advisory database from `https://github.com/RustSec/advisory-db.git`
      Loaded 1093 security advisories (from /Users/sac/.cargo/advisory-db)
    Updating crates.io index
error: not found: Couldn't load Cargo.lock
Caused by:
  -> I/O operation failed: I/O operation failed: entity not found
  -> I/O operation failed: entity not found
---
### Gate 7: OTEL Observability
✓ **OTEL observability integrated**
---
### Gate 8: Hardcoded Secrets Check
⚠ **Manual review required for potential secrets**
---
### Gate 9: Watch Mode Verification
✓ **Watch mode tests exist**
---
### Gate 10: WASM Build Verification
✓ **WASM built:** pkg/wasm4pm_bg.wasm (2.9M)

## Summary
✗ **Some release gates FAILED** - Review above
