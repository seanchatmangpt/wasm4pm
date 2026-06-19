# Benchmark Regression & Reporting

Two scripts sit on top of Criterion's existing baseline machinery
(`wasm4pm/target/criterion/`). Neither edits any bench source.

## 1. Regression gate — `scripts/bench_regress.py`

Runs a fast bench set twice (`--save-baseline` then `--baseline`), parses each
benchmark's `new/estimates.json` vs the saved baseline `estimates.json`, and
**exits 1** when any benchmark's *median* regresses beyond a threshold.

```bash
just bench-regress              # run fast benches + gate (default 10% threshold)
just bench-regress-check        # parse existing baselines without re-running
make bench-regress              # same via Make

BENCH_REGRESS_THRESHOLD=15 python3 scripts/bench_regress.py   # 15% threshold
BENCH_REGRESS_BENCHES="fast_algorithms" python3 scripts/bench_regress.py
python3 scripts/bench_regress.py --no-run --baseline main     # vs existing baseline
python3 scripts/bench_regress.py --criterion-dir <fixture>    # parse a fixture
```

| Env var | Default | Meaning |
|---------|---------|---------|
| `BENCH_REGRESS_THRESHOLD` | `10` | % median regression allowed before fail |
| `BENCH_REGRESS_BENCHES` | `fast_algorithms analytics hot_kernels` | bench set |
| `BENCH_REGRESS_BASELINE` | `regress-base` | Criterion baseline name |
| `BENCH_REGRESS_FEATURES` | `cloud` | cargo `--features` value |

Exit codes: `0` no regression · `1` regression beyond threshold · `2` no data.

## 2. Unified report — `scripts/bench_report.py`

Walks `target/criterion/**/new/estimates.json` and emits, in deterministic
(lexicographic) order:

- `docs/benchmarks/REPORT.md` — table of `Benchmark | Median | ±CI (95%)`
- `docs/benchmarks/report.csv` — `bench,median_ns,ci_lower_ns,ci_upper_ns`

```bash
just bench-report                                   # write REPORT.md + report.csv
make bench-report
python3 scripts/bench_report.py --criterion-dir <fixture> --out-dir <dir>
```

Exit codes: `0` report written · `2` no estimates found.
