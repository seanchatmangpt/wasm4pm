# Benchmark Regression, Reporting & Receipts

The `bench-tools` crate (`crates/bench-tools`) sits on top of Criterion's output
(`target/criterion/`). It is `cargo`-native — no Python runtime — and the
receipt uses the same BLAKE3 algorithm as the repository's execution receipts.
None of its subcommands edit bench source.

```bash
cargo run -p bench-tools -- <report|regress|receipt> [flags]
```

All three default `--criterion-dir` to the workspace's shared
`target/criterion` (honoring `CARGO_TARGET_DIR`).

## 1. Regression gate — `bench-tools regress`

Compares each current `new/estimates.json` *median* against the committed
baseline (`.wasm4pm/benchmarks/baselines/main-latest.json`) and **exits 1** when
any benchmark regresses beyond the threshold. A change within one measured
std-dev is treated as jitter, not a regression.

```bash
just bench-regress                                   # gate (default 10%)
make bench-regress
cargo run -p bench-tools -- regress --threshold 15   # 15% threshold
cargo run -p bench-tools -- regress --baseline <file> --criterion-dir <dir>
```

Exit codes: `0` no regression · `1` regression beyond threshold / no data.

## 2. Unified report — `bench-tools report`

Walks `target/criterion/**/new/estimates.json` and emits, in deterministic
(lexicographic) order:

- `docs/benchmarks/REPORT.md` — `Benchmark | Median | 95% CI`
- `docs/benchmarks/report.csv` — `bench,median_ns,ci_lower_ns,ci_upper_ns,std_dev_ns`

```bash
just bench-report
cargo run -p bench-tools -- report --criterion-dir <dir> --out-dir <dir>
```

## 3. Performance receipt — `bench-tools receipt`

Emits a `Wasm4pmBenchmarkReceipt.v1` binding **environment provenance**
(git commit + dirty flag, rustc, OS/arch, logical cores, CPU model, frequency
governor) to the **result set**, hashed with BLAKE3 and chained to the previous
receipt — the same doctrine as execution receipts, applied to measurement. A
benchmark number is only trustworthy if you can prove which code, on which
machine, under which toolchain produced it.

By default it refreshes `.wasm4pm/benchmarks/baselines/main-latest.json` — the
baseline both the regression gate and CI read.

```bash
just bench-receipt                                   # update the committed baseline
cargo run -p bench-tools -- receipt --print          # echo the receipt JSON
cargo run -p bench-tools -- receipt --no-baseline --out <file>
```

A `tree_dirty: true` receipt corresponds to no committed state — a gate should
refuse to trust it as a baseline.

Exit codes: `0` ok · `1` no estimates found · `2` bad arguments.
