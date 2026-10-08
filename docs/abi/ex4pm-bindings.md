<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/abi/ex4pm-bindings.md; source-sha256: 03f9ceafe2b7ecb2662b38b7ae60657a47801146aebe70a191241afdab86422c; reason: path-local documentation retained pending domain-specific supersession -->

# ex4pm-bindings ABI

Generated companion to `ex4pm-bindings.abi.json` (produced by
`crates/wasm4pm-ex4pm-bindings/scripts/gen_abi.py` from the `export_name`
attributes in `crates/wasm4pm-ex4pm-bindings/src/*.rs`; regenerate, do not edit the JSON).

## Summary

- ABI version 1, wasm32 target (pointers and `usize` lower to `i32`).
- 70 exports: 4 core, 33 request/response algorithms, 33 replay companions.

## Calling convention

1. `ptr = alloc_v1(len)`; write the UTF-8 JSON request into linear memory at `ptr`.
2. Call `<algo>_v1(ptr, len, out_len_ptr) -> out_ptr`; the response length is
   written through `out_len_ptr`.
3. Read `out_len` bytes at `out_ptr` (UTF-8 JSON), then release with
   `free_v1(out_ptr, out_len)`.
4. Release the request buffer with `dealloc_v1(ptr, len)` (same `len` as alloc).
   Reading an input never frees it; the host owns that release.

## Envelope

- Success: `{"result": <body>, "digest": "<16 hex>"}`
- Failure (unparsable request): `{"error": "<message>"}`

## Digest and replay

- Digest: FNV-1a 64-bit (offset `0xcbf29ce484222325`, prime `0x100000001b3`) over the
  serialized `result` body bytes, formatted `{:016x}`. Non-cryptographic in-WASM
  self-check; receipt identity uses BLAKE3 on the ex4pm side.
- `<algo>_replay_v1(ptr, len) -> u32` re-executes from the same request bytes
  and returns 1 iff the recomputed response is non-empty (`replay_ok`). It does
  not itself compare digests; a host compares the `digest` field of the original
  and recomputed responses. Computations are deterministic, so equal requests
  yield equal digests.

## Memory ownership

| Buffer | Produced by | Released by |
|---|---|---|
| request | `alloc_v1(len)` | host, `dealloc_v1(ptr, len)` |
| response | `<algo>_v1` | host, `free_v1(ptr, out_len)` |

## Algorithms

`align`, `allen_temporal`, `bayesian`, `conform`, `ctl_check`, `discover`, `dot_product`, `etc_precision`, `euclidean_distance`, `ewma`, `forecast`, `holt_forecast`, `htn_plan`, `ks_critical_value`, `ks_statistic`, `markov`, `mean`, `median`, `oc_discover`, `ocpq_eval`, `optimize`, `percentile`, `playout`, `powl_mine`, `prolog_query`, `regression`, `simulate`, `soundness`, `standardize`, `std_deviation`, `strips_plan`, `survival`, `trend_classify`

## Exports

| export | kind | params | result | source |
|---|---|---|---|---|
| `wasm4pm_ex4pm_align_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_align_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_allen_temporal_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_allen_temporal_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_bayesian_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_bayesian_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_bindings_alloc_v1` | core | `(len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_bindings_dealloc_v1` | core | `(ptr: i32, len: i32)` | - | src/lib.rs |
| `wasm4pm_ex4pm_bindings_free_v1` | core | `(ptr: i32, len: i32)` | - | src/lib.rs |
| `wasm4pm_ex4pm_bindings_version_v1` | core | `()` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_conform_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_conform_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_ctl_check_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_ctl_check_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_discover_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_discover_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_dot_product_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_dot_product_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_etc_precision_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_etc_precision_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_euclidean_distance_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_euclidean_distance_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_ewma_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_ewma_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_forecast_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_forecast_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_holt_forecast_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_holt_forecast_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_htn_plan_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_htn_plan_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_ks_critical_value_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_ks_critical_value_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_ks_statistic_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_ks_statistic_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_markov_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_markov_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_mean_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_mean_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_median_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_median_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_oc_discover_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_oc_discover_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_ocpq_eval_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_ocpq_eval_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_optimize_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_optimize_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_percentile_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_percentile_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_playout_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2_playout.rs |
| `wasm4pm_ex4pm_playout_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2_playout.rs |
| `wasm4pm_ex4pm_powl_mine_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_powl_mine_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_prolog_query_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/prolog.rs |
| `wasm4pm_ex4pm_prolog_query_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/prolog.rs |
| `wasm4pm_ex4pm_regression_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_regression_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_simulate_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_simulate_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/lib.rs |
| `wasm4pm_ex4pm_soundness_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_soundness_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_standardize_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_standardize_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_std_deviation_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_std_deviation_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_strips_plan_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_strips_plan_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_survival_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_survival_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase2.rs |
| `wasm4pm_ex4pm_trend_classify_replay_v1` | replay | `(ptr: i32, len: i32)` | i32 | src/phase4_stats.rs |
| `wasm4pm_ex4pm_trend_classify_v1` | request_response | `(ptr: i32, len: i32, out_len: i32)` | i32 | src/phase4_stats.rs |
