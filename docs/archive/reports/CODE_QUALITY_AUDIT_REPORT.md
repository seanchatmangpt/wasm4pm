# Code Quality Audit Report — wasm4pm v26.4.7

**Date:** 2026-04-08
**Agent:** Explore code quality and tech debt
**Duration:** ~255 seconds (25,550ms)
**Files Analyzed:** 90+ Rust files, 15+ TypeScript files

## Executive Summary

The code quality audit identified **30+ distinct issues** across the codebase, ranging from critical thread safety violations to pervasive type safety erosion. The most severe issues involve:

1. **Unsafe global mutable state** (3 occurrences) - Thread safety violations
2. **Pervasive `any` type usage** (75+ occurrences) - Complete loss of TypeScript type safety
3. **Massive code duplication** (20+ occurrences) - Maintenance burden
4. **Inconsistent error handling** (151 raw vs 43 structured) - Unreliable error reporting

## Priority 1: Critical Issues (Fix Soon)

### 1.1 Unsafe Global Mutable State ⚠️ **Thread Safety Violation**

**Severity:** HIGH - Will break with multi-threaded WASM

**Files:**
- `src/probabilistic/wasm_bindings.rs:10` - `static mut STREAMING_LOGS`
- `src/probabilistic/wasm_bindings.rs:32` - `static mut NEXT_HANDLE`
- `src/powl/conversion/from_petri_net.rs:229` - `static mut NEXT_ID`

**Current Code:**
```rust
static mut STREAMING_LOGS: Option<HashMap<String, StreamingLog>> = None;
static mut NEXT_HANDLE: usize = 1;

pub fn get_store() -> &'static mut StreamingLogStore {
    unsafe {
        if STREAMING_LOGS.is_none() {
            STREAMING_LOGS = Some(HashMap::new());
        }
        STREAMING_LOGS.as_mut().unwrap()
    }
}
```

**Issues:**
- No synchronization primitives
- Violates Rust idioms
- Will break with WASM threads proposal
- Data race risk in tests with parallelism

**Fix:**
```rust
use once_cell::sync::Lazy;
use std::sync::Mutex;

static STREAMING_LOGS: Lazy<Mutex<HashMap<String, StreamingLog>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_HANDLE: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(1));

pub fn get_store() -> &'static Mutex<HashMap<String, StreamingLog>> {
    &STREAMING_LOGS
}
```

### 1.2 Pervasive `any` Type Usage 🔴 **Type Safety Erosion**

**Severity:** HIGH - Complete loss of TypeScript type safety

**File:** `src/client.ts` (56 occurrences)

**Examples:**
```typescript
getCapabilityRegistry(): any
analyzeOCPerformance(ocel: OCELHandle): any
getTraceVariants(log: EventLogHandle): any
detectConceptDrift(log: EventLogHandle): any
clusterTraces(log: EventLogHandle, n: number): any
```

**Also affected:**
- `src/mcp_server.ts` - `(d: any) => d.distance`
- `src/visualizations.ts` - `stats: any`
- `src/receipt.ts` - `function sortObjectKeys(obj: any): any`
- `packages/engine/src/wasm-loader.ts` - `memory: any`, `[key: string]: any`

**Impact:**
- Consumers get zero compile-time guarantees
- IDE autocomplete is useless
- Refactoring is dangerous (no type checking)

**Fix:** Define proper interfaces:
```typescript
interface CapabilityRegistryResult {
  algorithms: AlgorithmInfo[];
  functions: FunctionInfo[];
}

getCapabilityRegistry(): CapabilityRegistryResult {
  return this.wasm.get_capability_registry();
}
```

### 1.3 Massive DFG Construction Duplication 📋 **Maintenance Burden**

**Severity:** MEDIUM-HIGH - Code duplication across 12 files

**Pattern:** `columnar_cache_get` + `to_columnar_owned` + `columnar_cache_insert`

**Files affected (20+ occurrences):**
- `src/discovery.rs:23,96,390`
- `src/simd_streaming_dfg.rs:440,471`
- `src/simd_token_replay.rs:302`
- `src/fast_discovery.rs:92`
- `src/hierarchical.rs:324,369`
- `src/more_discovery.rs:86,200`
- `src/advanced_algorithms.rs:24`
- `src/genetic_discovery.rs:24,135`
- `src/parallel_executor.rs:323,343`

**Current Boilerplate:**
```rust
let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
    .unwrap_or_else(|| {
        let owned = log.to_columnar_owned(activity_key);
        crate::cache::columnar_cache_insert(
            eventlog_handle.to_string(),
            activity_key.to_string(),
            owned.clone(),
        );
        owned
    });
let col = ColumnarLog::from_owned(&col_owned);
```

**Fix:** Extract to helper:
```rust
// In cache.rs or discovery.rs
pub fn get_or_build_columnar<F>(
    log_handle: &str,
    activity_key: &str,
    builder: F,
) -> ColumnarLog
where
    F: FnOnce() -> OwnedColumnarLog,
{
    if let Some(cached) = columnar_cache_get(log_handle, activity_key) {
        return ColumnarLog::from_owned(&cached);
    }
    let built = builder();
    columnar_cache_insert(
        log_handle.to_string(),
        activity_key.to_string(),
        built.clone(),
    );
    ColumnarLog::from_owned(&built)
}

// Usage:
let col = get_or_build_columnar(eventlog_handle, activity_key, || {
    log.to_columnar_owned(activity_key)
});
```

### 1.4 Inconsistent Error Handling 🔄 **Unreliable Error Reporting**

**Severity:** MEDIUM - Cannot reliably parse errors

**Two styles coexist:**

**Style A - Raw `JsValue::from_str` (151 occurrences):**
```rust
Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
None => Err(JsValue::from_str("EventLog handle not found")),
```

**Style B - Structured `wasm_err` (43 occurrences):**
```rust
use crate::error::{wasm_err, codes};

Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
None => Err(wasm_err(codes::INVALID_HANDLE, format!("OCEL '{}' not found", ocel_handle))),
```

**Issue:** JavaScript consumers cannot reliably parse error codes from all functions.

**Fix:** Standardize on `wasm_err` everywhere. Replace all raw `JsValue::from_str` calls.

### 1.5 JSON Injection Vulnerability 🔐 **Security Issue**

**File:** `src/error.rs:11-17`

**Current Code:**
```rust
pub fn wasm_err(code: &str, message: impl std::fmt::Display) -> JsValue {
    let json = format!(
        r#"{{"code":"{}","message":"{}"}}"#,
        code,
        message.to_string().replace('"', "\\\"")  // ⚠️ Only handles quotes
    );
    JsValue::from_str(&json)
}
```

**Issues:**
- Does not escape backslashes
- Does not escape newlines
- Does not escape control characters
- Message with `\` followed by `"` produces malformed JSON

**Fix:**
```rust
use serde_json::json;

pub fn wasm_err(code: &str, message: impl std::fmt::Display) -> JsValue {
    let json = json!({"code": code, "message": message.to_string()});
    JsValue::from_str(&json.to_string())
}
```

## Priority 2: Medium Impact Issues

### 2.1 Three Separate Error Code Systems

**Issue:** Three incompatible error code definitions exist:

1. **Rust:** `src/error.rs` - 7 codes (`INVALID_HANDLE`, `INVALID_INPUT`, etc.)
2. **wasm4pm TS:** `src/errors.ts` - 17 codes (`CONFIG_INVALID`, `SOURCE_UNAVAILABLE`, etc.)
3. **packages/contracts TS:** `packages/contracts/src/errors.ts` - 11 codes (`CONFIG_INVALID`, `SOURCE_NOT_FOUND`, etc.)

**Problem:** Overlapping but non-identical code sets create confusion.

**Recommendation:** Consolidate to single source of truth.

### 2.2 Streaming WASM Boilerplate Duplication

**File:** `src/streaming_wasm.rs`

Three nearly identical sets of WASM binding functions (18 functions total):
- `streaming_dfg_*` (lines 30-167)
- `streaming_skeleton_*` (lines 185-260)
- `streaming_heuristic_*` (lines 275-345)

**Issue:** Each follows same pattern: `begin`, `add_event`, `close_trace`, `snapshot`, `finalize`, `stats`

**Fix:** Use macro to generate bindings or deprecate in favor of unified `streaming_pipeline.rs`.

### 2.3 Unused Dead Code

**Files with `#[allow(dead_code)]`:**
- `src/alignments.rs:54` - `fn get_transition_activities`
- `src/simd_token_replay.rs:37` - `place_ids` field
- `src/simd_token_replay.rs:395` - `fn make_dfg`
- `src/parallel_executor.rs:164` - `fn compute_dfg_sequential`
- `src/process_tree.rs:16` - `fn node_to_json`
- `src/state.rs:19` - `StoredObject::JsonString`
- `src/powl/conversion/from_petri_net.rs:54` - `impl InternalNet::from_result`

**Recommendation:** Remove or mark with `#[cfg(test)]`.

### 2.4 Excessive `unwrap()`/`expect()` Usage

**Count:** 706 occurrences across 90 Rust files

**Top offenders:**
- `src/powl/conversion/from_petri_net.rs` - 91 calls
- `src/streaming/streaming_inductive.rs` - 30 calls
- `src/powl/footprints.rs` - 27 calls
- `src/powl/analysis/diff.rs` - 22 calls
- `src/binary_format.rs` - 41 calls
- `src/ilp_discovery.rs` - 24 calls
- `src/more_discovery.rs` - 33 calls

**Issue:** In WASM, unhandled panic terminates the entire module.

**Recommendation:** Replace with `?` propagation and proper error handling.

### 2.5 Excessive `.clone()` Usage

**Count:** 219 occurrences across 40 Rust files

**Top offenders:**
- `src/binary_format.rs` - 41 clones
- `src/powl/conversion/from_petri_net.rs` - 16 clones
- `src/smart_engine.rs` - 16 clones
- `src/powl/visualization/process_tree_svg.rs` - 12 clones
- `src/simd_streaming_dfg.rs` - 13 clones
- `src/cache.rs` - 15 clones

**Issue:** In WASM with limited memory, excessive cloning causes performance issues.

**Recommendation:** Replace with references or `Cow<str>`.

## Priority 3: Lower Impact Issues

### 3.1 Excessive Root-Level Documentation Files (30+ files)

**Files:** AI-generated implementation reports in repository root:
```
BENCHMARK_SUMMARY.txt
CONFIG_INTEGRATION_SUMMARY.md
CONTRACTS_IMPLEMENTATION.md
IMPLEMENTATION_COMPLETE.md
KERNEL_COMPLETION_REPORT.txt
PERFORMANCE_REPORT_v26.4.5.md
... (30+ total)
```

**Recommendation:** Move to `docs/reports/` or `docs/archive/`.

### 3.2 Unused Macro Exports

**File:** `src/streaming/mod.rs:241-275`

```rust
#[allow(unused_macros)]
macro_rules! impl_activity_interner_methods { ... }

#[allow(unused_imports)]
pub(crate) use impl_activity_interner_methods;
```

**Recommendation:** Remove if genuinely unused.

### 3.3 Inconsistent `_info()` Return Types

**Issue:** 15 `*_info()` functions have inconsistent return types:
- Return `String`: `conformance_info`, `ilp_discovery_info`, etc.
- Return `JsValue`: `discovery_info`, `recommendations_info`, etc.

**Recommendation:** Standardize on `JsValue` for WASM exports.

### 3.4 Large Files Requiring Split

| File | Lines | Suggestion |
|------|-------|------------|
| `src/client.ts` | 1,659 | Split by domain (discovery, conformance, prediction) |
| `src/mcp_server.ts` | 1,497 | Extract tool definitions to registry |
| `src/binary_format.rs` | 1,256 | Split read/write into separate modules |
| `src/powl/conversion/from_petri_net.rs` | 1,141 | Extract sub-algorithms |

### 3.5 Repetitive Catch-and-Rethrow Pattern

**File:** `src/client.ts`

**Pattern repeated 21 times:**
```typescript
} catch (error) {
    throw new Error(`Failed to ${operation}: ${error}`);
}
```

**Fix:**
```typescript
function wrapWasmCall<T>(name: string, fn: () => T): T {
    try { return fn(); }
    catch (error) { throw new Error(`Failed to ${name}: ${error}`); }
}
```

### 3.6 Stray Build Artifacts

**Files:**
- `/librust_out.rlib` (5,808 bytes)
- `/src/` (empty directory)

**Recommendation:** Remove and add to `.gitignore`.

### 3.7 `WasmModule` Interface Uses `any`

**File:** `packages/engine/src/wasm-loader.ts:18-23`

```typescript
export interface WasmModule {
  memory: any;
  version?: () => string;
  init?: () => void;
  [key: string]: any;  // ⚠️ Index signature makes everything untyped
}
```

**Issue:** Index signature erases type safety for all properties.

## Summary Statistics

| Issue | Count | Files Affected | Priority |
|-------|-------|----------------|----------|
| `unwrap()`/`expect()` calls | 706 | 90 files | P2 |
| `.clone()` calls | 219 | 40 files | P2 |
| `any` type in TypeScript | ~75 | 11 files | P1 |
| Inconsistent error style (raw JsValue) | 151 | 35 files | P1 |
| Structured error style (wasm_err) | 43 | 17 files | P1 |
| Dead code (`#[allow(dead_code)]`) | 10 | 8 files | P2 |
| `static mut` globals | 3 | 2 files | P1 |
| DFG construction duplication | 20+ | 12 files | P1 |
| Root-level report files | ~30 | Root dir | P3 |
| Large files (>700 lines) | 7 | - | P3 |

## Recommendations

### Immediate Actions (This Week)

1. ✅ **Fix unsafe globals** - Replace 3 `static mut` with `AtomicU64` or `Lazy<Mutex<...>>`
2. ✅ **Fix JSON injection** - Use `serde_json::json!` in `wasm_err`
3. ✅ **Standardize error handling** - Convert raw `JsValue::from_str` to `wasm_err`

### Short-Term (This Sprint)

4. **Add TypeScript interfaces** - Replace `any` types in client.ts
5. **Extract DFG helper** - Consolidate columnar cache boilerplate
6. **Remove dead code** - Delete or move to `#[cfg(test)]`

### Medium-Term (Next Sprint)

7. **Consolidate error codes** - Unify 3 error code systems
8. **Reduce unwrap/clone** - Refactor for safer error handling
9. **Clean up root directory** - Move report files to docs/

### Long-Term (Backlog)

10. **Split large files** - Break up files >1000 lines
11. **Add regression tests** - Cover optimized code paths
12. **Document architecture** - Add ADRs for major decisions

## Conclusion

The codebase is functional but has accumulated technical debt from rapid development. The most critical issues are:
- Thread safety violations (unsafe globals)
- Type safety erosion (pervasive `any`)
- Maintenance burden (code duplication)

Addressing these will improve reliability, maintainability, and developer experience. The optimizations completed in the `refactor/performance-optimizations` branch provide immediate performance benefits while maintaining code quality.

**Next Steps:**
1. Merge current refactoring branch
2. Create new branch for critical fixes (globals, JSON injection, error handling)
3. Create tech debt tracking in project management system
4. Schedule regular code quality audits (quarterly)
