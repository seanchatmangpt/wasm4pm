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

**Cross-machine normalization.** The breed suite includes a fixed `calibration/anchor`
workload that measures each host's raw speed. `receipt` records its median as
`calibration_ns`; `regress` scales the current run's latencies by
`baseline_calibration / current_calibration`, re-expressing them in the baseline
machine's time units. This cancels out hardware differences, so a baseline captured
on a developer laptop does not produce phantom regressions when the gate runs on a
slower CI runner. When either calibration is absent the factor is 1.0 (absolute
comparison). The anchor is excluded from regression reporting.

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

## 4. Receipt integrity — `bench-tools verify`

Recomputes the BLAKE3 over the canonical receipt body (everything except the two
hash fields) and confirms it matches the stored `receipt_hash`. A mismatch means
the receipt — or the results it vouches for — was altered after signing. Also
**refuses a `tree_dirty` receipt** as a baseline unless `--allow-dirty`. An
unverifiable receipt is just JSON; this is what makes the chain enforceable.

```bash
just bench-verify                                    # verify the committed baseline (local: dirty allowed)
cargo run -p bench-tools -- verify --receipt <file>  # strict: fails on a dirty-tree receipt
```

CI runs `receipt` → `verify` → `regress` so every benchmark run is provenance-
stamped and tamper-evident before the regression gate reads the baseline.

The regression gate (§1) only flags a regression when the median crosses the
threshold **and** the current 95% CI does not overlap the baseline's — a far
stronger signal than a point-estimate cross, which rejects the false positives
flat gates produce on noisy benchmarks.

## 5. Receipt-chain ledger — `bench-tools ledger`

Each `receipt` run appends a compact entry (commit, hashes, per-bench medians) to
an append-only `.wasm4pm/benchmarks/ledger.jsonl`, linked to the prior entry via
`previous_receipt_hash`. `ledger` walks that history to (a) **verify chain
integrity** — every entry must link to its predecessor, so an edited or dropped
run is detected — and (b) print a **per-bench median trend** (first → last,
% change, direction) across all recorded runs.

```bash
just bench-ledger                                    # chain integrity + trend
cargo run -p bench-tools -- ledger --bench mycin      # filter to one bench
```

This is the longitudinal governance layer: PR-to-PR regressions are caught by
§1, but slow multi-month drift is only visible across the whole ledger. A chain
break (exit 1) means the performance history was altered.

## 6. Correctness × performance — `bench-tools attest`

The synthesis gate, and the one that matters most for a *reasoning* engine: a
benchmark number is meaningless if the breed is wrong. A fast wrong answer is
worse than a slow correct one — yet a latency benchmark alone would silently
bless it.

`attest` runs the paper-grounded gate (per breed: does it reproduce its source
paper's published value?) and the falsification gate (does the suite confirm AND
reject mutants?), joins each breed's correctness with its measured latency, and
assigns a verdict:

| Verdict | Meaning |
|---|---|
| ✅ TRUSTED | paper-grounded **and** benchmarked — the latency is meaningful |
| ☐ CORRECT (unbenched) | proven correct, no latency sample yet |
| ⚠️ FAST-BUT-WRONG | benchmarked but **not** paper-grounded — the dangerous case |
| ❌ BROKEN | neither correct nor benchmarked |

```bash
just bench-attest                                    # → docs/benchmarks/ATTESTATION.md
```

**Fails (exit 1)** on any fast-but-wrong or broken breed, or a failed
falsification suite — the benchmark suite refuses to vouch for code that is not
provably correct. This is what ties the performance layer to the paper-grounded
and falsification gates: *trusted performance, not just fast numbers.*

Exit codes: `0` ok · `1` no estimates / tamper / untrusted / chain break / attestation failure · `2` bad arguments.
