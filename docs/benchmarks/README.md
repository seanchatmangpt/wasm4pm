<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/benchmarks/README.md; source-sha256: 382411a4a74fed8ae415c71b6474e39111bc2c2f8bb54773dd1f833314f5cb07; reason: path-local authority or entrypoint -->

# Benchmark Regression, Reporting & Receipts

The `bench-tools` crate (`crates/bench-tools`) sits on top of Criterion's output
(`target/criterion/`). It is `cargo`-native — no Python runtime — and the
receipt uses the same BLAKE3 algorithm as the repository's execution receipts.
None of its subcommands edit bench source. For the full inventory of every
benchmark surface in the repository (runners, Criterion targets, datasets,
gaps), see [`docs/reference/benchmarks.md`](../reference/benchmarks.md).

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
cargo run -p bench-tools -- regress --min-coverage 0.8  # require 80% overlap
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

**Coverage floor.** A run where only a fraction of the current benches overlap
the baseline used to exit 0 on the small overlap — a vacuous pass. `--min-coverage`
(default `0.5`) refuses that: when fewer than the floor's fraction of comparable
benches overlap, the gate fails with `INSUFFICIENT COVERAGE: only N/M current
benches overlap the baseline` and exits 1, so a partial Criterion run cannot
silently read as green.

**Baseline integrity.** `regress` recomputes the baseline's BLAKE3
`receipt_hash` on load. A tampered or forged baseline fails with
`UNUSABLE BASELINE` and exits 1 — the gate no longer trusts an unverified
number just because the file is on disk.

**Threshold validation.** `--threshold` must be a finite number in `(0, 1000]`;
anything else (including `NaN`, which used to neutralize every comparison)
prints `invalid --threshold` and exits 2. `--min-coverage` must be a finite
fraction in `[0, 1]` (exit 2 otherwise).

**Anchor matching is exact.** Only the bench id `calibration/anchor` is treated
as the calibration anchor; a substring test would silently exclude real
workloads like `breed_latency/calibration_overhead` from gating. Baseline
entries with non-finite or non-positive medians are excluded from comparison
and counted in a warning.

Exit codes: `0` no regression · `1` regression beyond threshold / insufficient
coverage / no data / unusable (tampered or forged) baseline · `2` bad
arguments, including an invalid threshold.

## 2. Unified report — `bench-tools report`

Walks `target/criterion/**/new/estimates.json` and emits, in deterministic
(lexicographic) order:

- `docs/benchmarks/REPORT.md` — `Benchmark | Median | 95% CI`
- `docs/benchmarks/report.csv` — `bench,median_ns,ci_lower_ns,ci_upper_ns,std_dev_ns`
  (RFC4180-escaped: fields containing a comma, quote, CR, or LF are quoted and
  embedded quotes doubled, so a bench id can no longer corrupt the column grid)

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

CI (`.github/workflows/benchmark-last24h.yml`) currently runs `receipt` →
`verify` only, so every benchmark run is provenance-stamped and tamper-evident.
The regression gate (`regress`) is **local-only until wired into CI** — until
then `just bench-regress` is the way to run it by hand.

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

**Ledger anchoring.** Every `receipt` run stamps two fields into the receipt
body — `ledger_previous_head` (the `receipt_hash` of the ledger entry that will
precede it) and `ledger_entry_count` (the 1-based position the entry will
occupy). `ledger` verifies the anchor: the entry at `ledger_entry_count - 1`
must carry exactly `ledger_previous_head`, so deleting or reordering a run
between the baseline and the ledger is detected even though every remaining
link still connects. A baseline minted before anchoring lacks the fields; that
is warned about once (`warning: baseline … predates ledger anchoring`) and not
failed, for backwards compatibility. Incomplete fields warn the same way.

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

Three join-and-count fixes sharpen what "correct" means here:

- **Full-id join.** Latency is keyed by the full Criterion bench id
  (`breed_latency/mycin`), not the name after the last `/` — the old key
  collapsed same-named benches from different families onto one row.
- **Parsed pass counts.** A correctness suite passes only if the cargo output
  parses to `failed == 0` **and** `passed > 0`. A suite that ran zero tests no
  longer reads as a pass.
- **Unbenched warning.** The summary prints
  `WARNING: N breed(s) are CORRECT but UNBENCHED` when any correct breed has no
  latency sample, so the absence of evidence is visible in the exit-0 case.

## 7. Performance budgets — `bench-tools budget`

SLOs as code, and machine-independent. A budget (in `docs/benchmarks/budgets.json`)
is the maximum allowed ratio of a benchmark's median to the `calibration/anchor`
median. Because both are measured on the same host, the ratio cancels machine
speed — a budget of `5.0` means "no slower than 5× this machine's calibration
workload" and holds on any runner.

**Override matching is path-boundary, not substring.** A key matches a bench id
iff the id *is* the key or lives *under* it (`key` or `key/…`). The
longest matching key wins. Substring matching would have let an override for
`breed_latency` silently capture `breed_latency_v2/x`.

**The default ratio is scoped.** `default_ratio` applies only inside
`default_ratio_scope` (default `breed_latency` — the family it was calibrated
against). Benches outside the scope with no matching override are **not
budgeted** and are counted as skipped, rather than mass-breached against a
ratio that was never calibrated for them.

**Invalid config refuses to run.** An empty override key (which once matched
every bench) exits 2 with `BUDGETS INVALID`. Without a calibration anchor the
check does not silently pass: it prints a `budget: SKIPPED` line and exits **3**,
so CI can distinguish "enforced, green" from "not enforced".

```json
{ "default_ratio": 1000.0, "default_ratio_scope": "breed_latency",
  "overrides": { "breed_latency/mycin": 50.0 } }
```

```json
{ "default_ratio": 1000.0, "overrides": { "breed_latency/mycin": 50.0 } }
```

```bash
just bench-budget                                    # fails on any breach
```

This is distinct from regression (§1): regression says "don't get worse than last
time"; a budget is an absolute ceiling the code must never cross, however the
baseline drifts. Tighten budgets as real measurements accumulate.

Exit codes (all subcommands): `0` enforced and green · `1` no estimates /
tampered or forged receipt or baseline / `tree_dirty` baseline without
`--allow-dirty` / chain break / attestation failure (fast-but-wrong, broken, or
zero-pass suite) / budget breach · `2` bad arguments, invalid `--threshold` /
`--min-coverage`, or an empty budget override key · `3` budget skipped — no
calibration anchor present (loud skip, never a silent pass).
