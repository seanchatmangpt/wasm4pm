<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/benchmarks.md; source-sha256: cbaa03605dfbb80972eefecf510725ef49fb145c0fe1bfe7d64eec568d181dc2; reason: canonical Diátaxis or ADR surface -->

# benchmarks.md

Reference index of every benchmark surface in the repository: what it measures,
how to run it, and where its output lands. Methodology and governance (receipts,
regression gates, budgets) are covered in
[`docs/benchmarks/README.md`](../benchmarks/README.md).

Standing note: numbers in older docs (`docs/performance/benchmark-paper-v26.6.9.md`,
`BENCHMARK_SUMMARY.txt`, `results/`, `artifacts/release/latency-benchmarks.txt`)
are historical evidence pinned to older versions (v26.6.9/v26.7.1 era) and are
not current standing for v26.10.8. Current raw evidence lives in
`.wasm4pm/benchmarks/` (regression snapshots and the receipt ledger).

## 1. Canonical runners

### 1.1 WASM algorithm benchmark (Node)

The canonical perf runner for the full WASM algorithm suite: all algorithms
across size series (100/1k/5k/10k events), parallelized via one Node Worker per
algorithm group.

```bash
cd wasm4pm && npm run bench:build    # build WASM, then bench
cd wasm4pm && npm run bench          # bench only
cd wasm4pm && npm run bench:ci       # reduced iterations
```

Output: `wasm4pm/results/wasm_bench_<timestamp>.json` and `.csv`.

### 1.2 WASM algorithm benchmark (browser)

Same suite in headless Chromium via vitest; per-algorithm median/min/max/p95 ms.

```bash
cd wasm4pm && npm run bench:browser     # 5 iterations
cd wasm4pm && npm run bench:browser:ci  # CI_MODE=true, 3 iterations
```

### 1.3 App plumbing bench (vitest bench)

Surface-Y plumbing: `withSpan`, `blake3Hex` (1KB/1MB), `saveCommandReceipt`
on temp dirs.

```bash
cd apps/wasm4pm && npm run bench       # vitest bench --run
```

## 2. Real-data and adversarial suites

### 2.1 Real-data WASM bench

~15 Tier-2 (handle-based) algorithms against real event logs. Loads whichever
of `bench_data/sepsis.xes`, `bench_data/bpi2020_domestic_declarations.xes`,
`bench_data/roadtraffic100traces.xes` exist.

```bash
npm run bench:real                     # benchmarks/real_data_wasm_bench.js
```

Output: stdout tables per algorithm per dataset.

### 2.2 Adversarial audit suite (`benchmarks/adversarial/`)

Vitest regression suite against van der Aalst mathematical oracles (Tier-0
algorithms). Generates a 500K-event synthetic log with fitness-1.0 ground
truth; asserts Rank-1 / Bellman-update / Western Electric invariants.

```bash
cd benchmarks/adversarial && npx vitest run      # oracle regression suite
cd benchmarks/adversarial && npm run audit       # full 41-algorithm audit → results/
```

### 2.3 miniml comparisons (`benchmarks/miniml/`)

WASM miniml regression/SMA/EMA vs hand-written pure-JS and the
`simple-statistics` npm package; stdout speedup tables.

```bash
cd benchmarks/miniml && node --experimental-wasm-modules benchmark.js
cd benchmarks/miniml && node --experimental-wasm-modules compare.js
```

## 3. Rust (Criterion) benchmark targets

Invoked as `cargo bench -p <pkg> --bench <name>`; add `--features cloud` for
cloud-gated targets. Most `wasm4pm` benches are grounded on real XES logs from
`wasm4pm/bench_data/`; the synthetic-log fallback deliberately panics
(TPS rule — real data or nothing).

### wasm4pm package (46 registered targets)

Discovery/mining: `fast_algorithms` (<50ms/call), `medium_algorithms`
(5–200ms), `slow_algorithms` (>200ms by design; GA/PSO/ILP),
`tier1_discovery` (DFG/Skeleton/Alpha++/Heuristic/Inductive, prefix sweeps),
`tier2_metaheuristic`, `extended_discovery`, `powl_discovery`,
`real_data_bench` (16 algorithms × 3 real datasets), `native_api_bench`
(no WASM boundary), `gall_process_portability` (POWL→DFA→WASM lowering,
≥5x regression bound at n=10000).

Conformance/OCEL: `conformance_bench` (token replay, streaming DFG replay
via `SimdStreamingDfg` — its WASM simd128 path is width-1 lane
read/replace/store, not a demonstrated vectorization win over the scalar
path; see `wasm4pm/src/simd_streaming_dfg.rs` — ETConformance, DECLARE,
temporal profiles), `self_conformance`,
`ocel_flattening` (1:1/1:N/M:N loss), `ocel_export`, `parser_bench` (XES
parsing), `cognition_infeasible` (autodiscovered, not registered).

ML/prediction/RL/drift: `ml_algorithms`, `ml_latency`, `ml_streaming_sim_bench`,
`prediction_accuracy` (Top-K/MAE/RMSE/F1, 6 perspectives, 70/30 hold-out),
`prediction_latency`, `prediction_baseline_comparison` (n-gram vs uniform),
`drift_bench`, `drift_detection_detailed` (window/EWMA-alpha tuning),
`rl_convergence` (cloud), `rl/mttr_recovery` (4 recovery paths),
`constant_latency_loops` (perf-counter cycle predictability),
`rdtsc_validation` (timer read overhead), `autoprocess_latency` (cloud),
`autoprocess_criterion` (cloud), `automl_profiling`, `hot_kernels`,
`simd_inner_loops` (historically-named `Simd*` kernels; the implementations
are scalar 4x/8x-unrolled loops with no platform SIMD intrinsics — see
`wasm4pm/src/simd_inner_loops.rs`), `cache_efficiency_bench`,
`streaming_vs_batch`, `streaming_algorithms`,
`scalability_benchmark` (batch 256→8192, throughput inflection), `analytics`,
`oracle_rank_validation` (cost of the anti-lie oracle checks themselves),
`anti_fake`, `route_driven_tdd`, `jtbd_benchmark` (cloud),
`autonomy_jtbd_validation` (cloud), `agentic_bench` (cloud),
`enterprise_architecture` (autodiscovered; checked-in `receipt.xes`),
`closed_claw` (constitution suite: 6 pipeline classes A–F, 5 pass/fail gates,
BLAKE3 receipt per benchmark; `--features browser`;
filter e.g. `-- "closed_claw/A_discovery"`).

### Other crates

| Crate | Target | Measures | Command |
|---|---|---|---|
| ocpq | `predicates` | Constraint/predicate evaluation over OCEL query trees | `cargo bench -p ocpq --bench predicates` |
| prolog8 | `inference` | Kernel inference: fact blocks, rule resolution, proofs, hashing | `cargo bench -p prolog8 --bench inference` |
| wasm4pm-cli | `cli` | `Io::new`, colored formatting, printing overhead | `cargo bench -p wasm4pm-cli --bench cli` |
| wasm4pm-cognition | `breed_latency` | Data-driven: walks `tests/fixtures/papers/*.json`, benches each resolved BreedId | `cargo bench -p wasm4pm-cognition --bench breed_latency` |
| wasm4pm-cognition | `cognition_divan` | Divan 0.1: allocation counts/bytes, batches [1,4,16,64], context-noise rails | `cargo bench -p wasm4pm-cognition --bench cognition_divan` |
| wasm4pm-cognition | `breed_determinism` | 13 breeds run twice, asserts identical output (assertion harness) | not a runnable bench |
| miniml-core | `simple_bench`, `wasm_bench` | ML/optimization; not registered (`autobenches = false`) | not cargo-bench invocable |

Note: `wasm4pm-cognition` also registers ~45 correctness/falsification harnesses
as bench targets (one per breed, `sat_cdcl`, `chain_*`, …) — these are
correctness courts, not latency benchmarks.

## 4. Test-example benches (not `cargo bench`)

| What | Where | Run |
|---|---|---|
| 35 capabilities vs BPI real logs (tier system) | `wasm4pm/tests/benchmarks.rs` | `cargo test --release --test benchmarks -- --include-ignored --nocapture` |
| Batch vs streaming discovery | `wasm4pm/tests/bench_compare.rs` | `cargo test --release --test bench_compare -- --nocapture` |
| Quality thresholds (fitness/precision/simplicity) | `wasm4pm/tests/quality_benchmarks.rs` | `cargo test --release --test quality_benchmarks -- --nocapture` |
| Disjoint LinUCB (Li et al.) CPU baseline vs GPU targets | `wasm4pm/examples/gpu_wgsl_benchmark.rs` | `cargo run --release -p wasm4pm --example gpu_wgsl_benchmark` |

These emit stdout/test evidence, not Criterion datasets — they do not feed the
`bench-tools` pipeline (§5).

## 4b. apps/wasm4pm regression gate (NOT WIRED)

Archived 2026-10-10 to `docs/archive/2026-10-10/apps-wasm4pm-benchmarks/` (dead
system, ERRC lane): `apps/wasm4pm/benchmarks/regression-test-suite.ts` is a CLI-driven comparator
(`--baseline <file> --current <file>`, exit codes 0/1/2/3). Current standing:
nothing invokes it (no package.json script, no CI workflow), and the adjacent
`baseline.json` (v26.4.17) does not match the schema its own loader accepts —
the gate cannot run against the shipped baseline. Treat both as dormant. The
live regression gate is `bench-tools regress` (§5), which is itself unseeded
(§7).

## 5. Governance layer (`crates/bench-tools`)

Cargo-native governance over Criterion output (`target/criterion/`):

| Command | Purpose |
|---|---|
| `just bench-report` | Deterministic `docs/benchmarks/REPORT.md` + `report.csv` from Criterion estimates |
| `just bench-regress` | Gate vs `.wasm4pm/benchmarks/baselines/main-latest.json` (threshold + 95% CI non-overlap, cross-machine calibration) |
| `just bench-receipt` | BLAKE3 provenance receipt; refreshes the baseline, appends to the chained ledger |
| `just bench-verify` | Recompute receipt BLAKE3; tamper detection; refuses dirty-tree baselines (without `--allow-dirty`) |
| `just bench-ledger` | Verify append-only receipt chain; per-bench median trend |
| `just bench-attest` | Joins correctness gates with latency; FAILS on fast-but-wrong breeds |
| `just bench-budget` | SLOs as code (`docs/benchmarks/budgets.json`); median/calibration-anchor ratios |

## 6. Datasets

`bench_data/` + `bench_data/README.md`: BPI2020, Sepsis, BPI2013, road-traffic
tiers with DOIs; `make bench-data` downloads. Dataset labeling was corrected
and the downloader hardened on 2026-10-10 (639138cd5): the real 1,050-case
`sepsis.xes` is restored (the 5-trace stub is kept as
`bench_data/sepsis_stub_5traces.xes`), `bpi2020_travel` was renamed to
`bpi2020_domestic_declarations`, and downloads now validate HTTP status,
minimum size, content sniff and optional sha256. Several Tier-1/2/3 files
named in the README remain absent — see `bench_data/MISSING-DATASETS.md`.
Known-golden fixtures also live in `wasm4pm/bench_data/` for the Rust
benches.

## 7. Known gaps (as of 2026-10-10)

Findings D1–D19 with full evidence, per-finding status, and the 2026-10-10 run
record live in
[`docs/benchmarks/RESULTS-2026-10-10.md`](../benchmarks/RESULTS-2026-10-10.md).
Pruned from this list as fixed: dataset poisoning (D1–D3, 639138cd5), bench-tools
gate evasions (D4–D6, 07d79cef9/512b05086), dead bench + dead apps regression
gate (D13/D16 partial, e7dc95ced). Still genuinely open:

- `.wasm4pm/benchmarks/baselines/main-latest.json` — the baseline the
  documented `regress` gate reads — does not exist; the gate cannot run as
  written until a `just bench-receipt` run on clean main recreates it (D7).
  Same for `REPORT.md`/`report.csv` and the receipt ledger.
- No current headline report: the flagship characterisation is pinned to
  v26.6.9, the release latency capture to v26.7.1; v26.10.8 numbers live in
  the run record + raw regression JSON.
- `results/` frozen at April/July 2026; `BENCHMARK_SUMMARY.txt` predates four
  minor releases.
- `docs/primitives/08-BENCHMARK-GATES.md` cites an undated "32 APIs with zero
  benchmark coverage" audit of unknown status.
- `templates/benchmarks-reference.njk` references `benchmark_500.xes`, absent
  from `bench_data/`.
- `benchmarks/adversarial/` sits outside the pnpm workspace; SUMMARY.md
  contradicts the registry (D14). CI never runs `bench-tools regress` (D8).
  320 tracked tsc build outputs still need `git rm --cached` (D15, partial:
  e7dc95ced gitignored + listed them).

## See Also

- [`docs/benchmarks/README.md`](../benchmarks/README.md) — bench-tools methodology
- [`docs/benchmarks/COVERAGE.md`](../benchmarks/COVERAGE.md) — per-target coverage matrix
- [`docs/explanation/benchmarks_thesis.md`](../explanation/benchmarks_thesis.md) — what the numbers mean
- [`docs/primitives/08-BENCHMARK-GATES.md`](../primitives/08-BENCHMARK-GATES.md) — the five gates
