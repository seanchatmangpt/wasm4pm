<!-- wasm4pm-doc-status: archived; reviewed: 2026-08-02; original: scripts/pm4py-parity/parity-report.md; source-sha256: 43fcb22f3b330f7c8ccb3685050897a503434c09e321578ae8fb3768b64265f3; reason: historical, generated, status, or evidence narrative -->

# pm4py Parity Report

Reference numbers from real runs of `scripts/pm4py-parity/oracle.py`
(pm4py 2.7.22.1, system python3.14, Darwin 25.2.0, no network, deterministic).
Models: inductive-miner discovered, `concept:name` activity key.
Raw JSON artifacts sit alongside this report.
Repo state: main@e7dc95ced, 2026-10-10.

## Run 1: sepsis.xes, inductive-discovered model

Command (exit 0):

```bash
python3 scripts/pm4py-parity/oracle.py \
    --log bench_data/sepsis.xes --discover inductive \
    --out scripts/pm4py-parity/sepsis-inductive.json
```

Inputs: 1,050 traces, 15,214 events from `bench_data/sepsis.xes`.
Raw JSON: `scripts/pm4py-parity/sepsis-inductive.json`.

| Metric | Value |
|---|---|
| token replay log_fitness (Σ-based) | 1.0 |
| token replay average_fitness (mean per-trace) | 1.0 |
| token replay % fitting traces | 100.0 |
| tokens consumed / produced / missing / remaining | 49,275 / 49,275 / 0 / 0 |
| ETConformance precision | 0.25762075419340746 |
| alignment log_fitness (Σ-based) | 0.9998578695681426 |
| alignment average_fitness (mean per-trace) | 1.0 |
| alignment % fitting traces | 100.0 |
| alignment Σ log moves / Σ model moves | 24,611 / 0 |

## Run 2: bpi2020_domestic_declarations.xes, inductive-discovered model

Command (exit 0):

```bash
python3 scripts/pm4py-parity/oracle.py \
    --log bench_data/bpi2020_domestic_declarations.xes --discover inductive \
    --out scripts/pm4py-parity/bpi2020-inductive.json
```

Inputs: 10,500 traces, 56,437 events from
`bench_data/bpi2020_domestic_declarations.xes`.
Raw JSON: `scripts/pm4py-parity/bpi2020-inductive.json`.

| Metric | Value |
|---|---|
| token replay log_fitness (Σ-based) | 1.0 |
| token replay average_fitness (mean per-trace) | 1.0 |
| token replay % fitting traces | 100.0 |
| tokens consumed / produced / missing / remaining | 237,714 / 237,714 / 0 / 0 |
| ETConformance precision | 0.39080579250664294 |
| alignment log_fitness (Σ-based) | 0.9997527210745741 |
| alignment average_fitness (mean per-trace) | 1.0 |
| alignment % fitting traces | 100.0 |
| alignment Σ log moves / Σ model moves | 139,562 / 0 |

## Notes

- Alignment log_fitness is slightly below 1.0 despite zero model moves and
  100% fitting traces. This is pm4py's Σ-based alignment cost formula
  (worst-case denominator includes τ-transition costs), not a computation
  error: every per-trace alignment fitness is 1.0.
- Inductive-discovered models replay perfectly (fitness 1.0); the
  discriminating reference number for parity work is therefore the
  ETConformance precision (0.2576 sepsis, 0.3908 bpi2020).
- Lane 9 comparability rules are in `scripts/pm4py-parity/README.md`
  (pm4py `average_trace_fitness` ↔ wasm4pm `avg_fitness`; pm4py Σ-based
  `log_fitness` has no identical wasm4pm aggregate).
