# Iteration 4: AutoInstincts Audit — Completed

**Date:** 2026-05-18  
**Goal:** Identify and fix RL/SPC/healing gaps via code review  
**Status:** COMPLETE

## Gaps Identified (3)

### Gap 1: Agent Convergence Metrics Missing (Requires Future Extension)
- **File:** `wasm4pm/src/rl_orchestrator.rs:414-436`
- **Issue:** `linucb_update()` emits TD error but not weight norm growth
- **Evidence:** Rank-4 statistical oracle requires convergence metrics
- **Fix Status:** Documented; blocked on `LinUCBAgent::get_weight_norm()` public API
- **Impact:** High (observability) — deferred to Cycle 5

### Gap 2: SPC Rule 2 Boundary Ambiguity (FIXED)
- **File:** `wasm4pm/src/spc.rs:167-192`
- **Issue:** Docstring didn't clarify whether Rule 2 fires at point 9 or 10
- **Evidence:** FM-5 risk — test brittleness from unclear specification
- **Fix Applied:** Added explicit docstring with trigger point semantics
- **Status:** ✓ IMPLEMENTED

### Gap 3: Circuit Breaker Healing Decision Rationale (FIXED)
- **File:** `wasm4pm/src/self_healing.rs:306-353`
- **Issue:** `allow_request()` span didn't include timeout comparison operands
- **Evidence:** FM-5 violation — observers cannot verify decision was sound
- **Fix Applied:** Added `timeout_comparison_result` to span for full audit trail
- **Status:** ✓ IMPLEMENTED

## Implementations

### 1. Circuit Breaker Span Enhancement ✓
Added `timeout_comparison_result` to OTEL span in `allow_request()` method.
Span now emits full decision audit trail: elapsed_ms, threshold_ms, comparison result, and reason.

### 2. SPC Rule 2 Documentation ✓
Clarified docstring: Rule 2 fires at exactly the 9th point (inclusive window).
Sequence breaks when a point crosses CL, resetting the counter.

### 3. Reward Function Completeness Tests ✓
Added 3 comprehensive unit tests validating all reward components.
All tests PASS.

## Test Results

**Before:** 772 tests passed
**After:** 775 tests passed (3 new)
**Pre-existing failures:** 9 (unchanged)

---

**Summary:** 3 gaps found; 2 fully fixed; 1 documented for future extension.
