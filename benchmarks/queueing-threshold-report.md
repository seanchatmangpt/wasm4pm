# Queueing Threshold Report — wasm4pm Certified Breeds

**Generated:** 2026-06-09
**Status:** TEMPLATE — all timing values PENDING real bench results
**Command to populate:** `cargo bench -p wasm4pm-cognition -- breed_latency`

---

## Methodology

### Service Time Measurement

Each breed is benchmarked via `criterion` in `crates/wasm4pm-cognition`. The harness:

1. Constructs a minimal valid `BreedInput` for the breed under test.
2. Calls `cognition_run` through the WASM boundary (Node.js target).
3. Records wall-clock service time for the WASM invocation only (excludes JS serialization overhead).
4. Reports p50, p95, p99, and p99.9 latencies over ≥1 000 iterations after a 100-iteration warm-up.

### Queueing Regimes

Four regimes are defined by the M/D/1 admission threshold used in the planner:

| Regime | Symbol | Service Time Bound | Typical workload |
|---|---|---|---|
| Interrupt | `tau_interrupt` | < 100 µs | Pattern match, hash lookup, ELIZA-class rewrite |
| Control | `tau_control` | 100 µs – 1 ms | Operator selection, shallow graph walk |
| Interactive | `tau_interactive` | 1 ms – 100 ms | Rule chaining, case retrieval, blackboard round |
| Batch | `tau_batch` | > 100 ms | State-space search, constraint solving, large input |

A breed is **Admitted** to a regime when its p99 service time falls strictly below that regime's bound. Breeds whose p99 exceeds `tau_batch` are flagged **OVER_THRESHOLD** and must be routed to the async queue.

---

## Results

| Breed | p50 | p95 | p99 | p99.9 | Admitted Regime | Status |
|---|---|---|---|---|---|---|
| `eliza` | PENDING | PENDING | PENDING | PENDING | `tau_interrupt` (estimated) | PENDING |
| `soar` | PENDING | PENDING | PENDING | PENDING | `tau_control` (estimated) | PENDING |
| `cbr` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |
| `prolog8` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |
| `mycin` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |
| `gps` | PENDING | PENDING | PENDING | PENDING | `tau_batch` to `tau_interactive` (estimated) | PENDING |
| `strips` | PENDING | PENDING | PENDING | PENDING | `tau_batch` to `tau_interactive` (estimated) | PENDING |
| `dendral` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |
| `hearsay` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |
| `autoinstinct_vision` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |
| `autoinstinct_semantics` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |
| `autoinstinct_neurosis` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |
| `autoinstinct_learning` | PENDING | PENDING | PENDING | PENDING | `tau_interactive` (estimated) | PENDING |

### Estimation Rationale

| Breed | Algorithm Complexity | Regime Estimate Basis |
|---|---|---|
| `eliza` | O(n) pattern scan over fixed rule table | Microsecond-range string rewrite — `tau_interrupt` |
| `soar` | Operator preference evaluation over working memory | Shallow graph walk — `tau_control` |
| `cbr` | k-NN retrieval over case base | Linear scan with similarity scoring — `tau_interactive` |
| `prolog8` | SLD resolution with backtracking | Search depth-dependent; worst-case exponential — `tau_interactive` |
| `mycin` | Backward-chaining with certainty factors | Rule-chain depth bounded in practice — `tau_interactive` |
| `gps` | Means-ends analysis, state-space search | Depth/branching dependent — `tau_batch` to `tau_interactive` |
| `strips` | Forward state-space planning | Plan length dependent — `tau_batch` to `tau_interactive` |
| `dendral` | Constraint-directed hypothesis generation | Bounded by spectral interpretation rules — `tau_interactive` |
| `hearsay` | Blackboard architecture, multi-KS rounds | KS activation count dependent — `tau_interactive` |
| `autoinstinct_vision` | Pixel/feature extraction + classification | Input image size dependent — `tau_interactive` |
| `autoinstinct_semantics` | Embedding lookup + similarity | Corpus size dependent — `tau_interactive` |
| `autoinstinct_neurosis` | Anomaly scoring over feature vector | Feature count dependent — `tau_interactive` |
| `autoinstinct_learning` | Incremental model update | Batch size dependent — `tau_interactive` |

---

## Reproducibility

### Prerequisites

```bash
# WASM cognition crate must be built first
cd crates/wasm4pm-cognition
wasm-pack build --target nodejs --out-dir pkg -- --features wasm
cd ../..
```

### Run Benchmarks

```bash
cargo bench -p wasm4pm-cognition -- breed_latency
```

Criterion writes HTML reports to `target/criterion/breed_latency/`.

### Populate This Table

After bench runs complete, extract p50/p95/p99/p99.9 from criterion JSON output and replace each `PENDING` cell. Update `Admitted Regime` from estimated to measured, and set `Status` to one of:

- `ADMITTED` — p99 < regime bound
- `OVER_THRESHOLD` — p99 ≥ `tau_batch` bound; route to async queue
- `BORDERLINE` — p99 within 10% of regime boundary; flag for re-bench under load

### Criterion JSON Location

```
target/criterion/breed_latency/<breed_name>/new/estimates.json
```

Key fields: `mean.point_estimate`, `std_dev.point_estimate` (nanoseconds).

---

## Notes

- Estimates assume minimal valid inputs. Production inputs (large case bases, deep Prolog programs, high-resolution images) will shift autoinstinct and search breeds toward `tau_batch`.
- OTEL spans emitted during bench runs are discarded by the harness to avoid I/O contaminating service-time measurements.
- Re-run after any change to `crates/wasm4pm-cognition/src/breeds/` that affects hot-path logic.
