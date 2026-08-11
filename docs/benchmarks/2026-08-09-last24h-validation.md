# wasm4pm Last-24-Hour Benchmark Validation — 2026-08-09

## Scope

This document records the exact-head benchmark validation initiated on 2026-08-09.

Admission is based on GitHub repository `PushEvent` and branch `CreateEvent` timestamps within the preceding 24 hours. The current `main` head is retained as a mandatory baseline even when no pre-existing branch satisfies the strict activity window. The validation branch itself is an admitted active subject after benchmark repairs are manufactured.

## Frozen baseline

- repository: `seanchatmangpt/wasm4pm`
- baseline branch: `main`
- baseline SHA: `43c9141fdcda2c316d33702d08cd9b49d624bb44`
- candidate branch: `agent/validate-last24h-benchmarks-20260809`

## Repair discovered by execution

The first non-empty execution proved two concrete failures rather than accepting an infrastructure blocker:

1. `closed_claw` contained stale `HashMap` bench-local constructors after deterministic model fields moved to `BTreeMap`.
2. the Node/WASM build used `wasm-pack --mode no-install`, which refused to acquire the required `wasm-bindgen` executable in the clean GitHub runner.

The candidate branch repairs those boundaries by aligning the closed-claw benchmark constructors with the ordered model maps and allowing `wasm-pack` to provision its matching bindgen tool.

## Validation contract

For every admitted exact branch head the workflow executes and records independently:

- `cargo test --manifest-path wasm4pm/Cargo.toml --lib --locked --quiet`
- `cargo bench --manifest-path wasm4pm/Cargo.toml --bench closed_claw --locked -- --output-format bencher --warm-up-time 1 --measurement-time 3`
- `cargo bench --manifest-path wasm4pm/Cargo.toml --bench fast_algorithms --locked -- --output-format bencher --warm-up-time 1 --measurement-time 3`
- Node/WASM build followed by `node benchmarks/wasm_bench_runner.js --ci`
- benchmark receipt manufacture and verification through `bench-tools` when present

The workflow uploads its branch inventory, activity inventory, full per-subject logs, and Markdown receipt as a GitHub Actions artifact even on failure.

## Current numeric evidence

Fresh baseline `fast_algorithms` measurements observed on `main@43c9141fdcda2c316d33702d08cd9b49d624bb44` before repair completion:

| Benchmark | Fresh measurement |
|---|---:|
| DFG discovery, 100 cases | 8,932 ns/iter |
| DECLARE discovery, 100 cases | 28,719 ns/iter |
| Heuristic miner t=0.3, 100 cases | 16,236 ns/iter |
| Heuristic miner t=0.5, 100 cases | 16,261 ns/iter |
| Heuristic miner t=0.8, 100 cases | 5,543 ns/iter |
| Alpha++, 100 cases | 61,667 ns/iter |
| Inductive Miner, 100 cases | 28,138 ns/iter |
| Hill climbing, 100 cases | 8,839 ns/iter |
| Process skeleton, 100 cases | 59,016 ns/iter |
| Event statistics, 100 cases | 302 ns/iter |
| Case duration, 100 cases | 621 ns/iter |

These numbers are explicitly baseline evidence, not the final candidate crown. Final candidate and end-to-end WASM/closed-claw numbers are admitted only from a successful exact-head validation artifact.
