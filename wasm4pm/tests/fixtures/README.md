# wasm4pm Benchmark Fixtures

Process mining event logs for benchmarking wasm4pm's discovery and conformance algorithms.

## Real Datasets (from 4TU Research Data)

All datasets are **real-world event logs** licensed under **CC BY 4.0** from https://data.4tu.nl/collections/Process_Mining/5065541.

### Tier 0 (Sanity Check)

| Dataset          | Cases | Events | Activities | Size  | DOI                   | Download                                                                       |
| ---------------- | ----- | ------ | ---------- | ----- | --------------------- | ------------------------------------------------------------------------------ |
| **Sepsis Cases** | 1,050 | 15,214 | 16         | ~1 MB | 10.4121/uuid:915d2bfb | [Link](https://data.4tu.nl/articles/dataset/Sepsis_Cases_-_Event_Log/12707639) |

**Use:** Sub-second latency baseline, daily CI validation. Hospital ICU sepsis treatment process with irregular trace lengths (5–185 events).

---

### Tier 1 (Standard)

| Dataset                     | Cases  | Events  | Activities | Size   | DOI              | Download                                                                           |
| --------------------------- | ------ | ------- | ---------- | ------ | ---------------- | ---------------------------------------------------------------------------------- |
| **BPI 2020 Travel Permits** | 7,065  | 86,581  | 35         | ~2 MB  | 10.4121/12752820 | [Link](https://data.4tu.nl/articles/dataset/BPI_Challenge_2020/12752820)           |
| **BPI 2013 Incidents**      | 7,554  | 65,533  | 13         | ~2 MB  | 10.4121/12693914 | [Link](https://data.4tu.nl/articles/dataset/BPI_Challenge_2013_incidents/12693914) |
| **BPI 2012 Loans**          | 13,087 | 262,200 | 36         | ~15 MB | 10.4121/12689204 | [Link](https://data.4tu.nl/articles/dataset/BPI_Challenge_2012/12689204)           |

**Use:** Standard benchmarks.

- BPI 2020: Current wasm4pm primary baseline (typical workload).
- BPI 2012: Cited in 100+ process mining papers; literature comparison baseline.
- BPI 2013: ITSM process with reference model for conformance checking.

---

### Tier 2 (Large)

| Dataset                          | Cases   | Events    | Activities | Size   | DOI                        | Download                                                                                   |
| -------------------------------- | ------- | --------- | ---------- | ------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| **BPI 2015 Building Permits**    | 28,657  | 376,467   | 396        | ~40 MB | 10.4121/uuid:31a308ef-c844 | [Link](https://data.4tu.nl/articles/dataset/BPI_Challenge_2015/12715853)                   |
| **BPI 2017 Loans**               | 31,509  | 1,202,267 | 26         | ~80 MB | 10.4121/uuid:5f3067df      | [Link](https://data.4tu.nl/articles/dataset/BPI_Challenge_2017/12696884)                   |
| **Road Traffic Fine Management** | 150,370 | 561,470   | 11         | ~50 MB | 10.4121/uuid:270fd440      | [Link](https://data.4tu.nl/articles/dataset/Road_Traffic_Fine_Management_Process/12683249) |

**Use:** Stress testing.

- BPI 2015: Activity explosion stress (O(A²) sensitivity; 396 unique activities = 156K-cell DFG).
- BPI 2017: Deep traces stress (31K cases × 38 events/case; largest sequential structure).
- Road Traffic: Wide/shallow stress (150K cases × 3.7 events/case; memory bandwidth test).

---

### Tier 3 (Max Throughput)

| Dataset          | Cases   | Events    | Activities | Size    | DOI                   | Download                                                                 |
| ---------------- | ------- | --------- | ---------- | ------- | --------------------- | ------------------------------------------------------------------------ |
| **BPI 2019 P2P** | 251,734 | 1,595,923 | 42         | ~150 MB | 10.4121/uuid:3926db30 | [Link](https://data.4tu.nl/articles/dataset/BPI_Challenge_2019/12715853) |

**Use:** Maximum throughput validation. Largest multi-attribute log in BPI Challenge collection. Target: >1M events/sec for streaming algorithms.

---

## Setup

### Automatic Download

```bash
# Tier 1 (required; ~30 MB)
make bench-data

# Tier 2 (adds stress tests; ~150 MB)
TIER=2 make bench-data

# Tier 3 (adds max throughput; ~200 MB)
TIER=3 make bench-data
```

Or directly:

```bash
bash scripts/download_datasets.sh
TIER=2 bash scripts/download_datasets.sh
TIER=3 bash scripts/download_datasets.sh
```

Datasets are downloaded to `bench_data/` and symlinked to `tests/fixtures/` for use in benchmarks.

### Manual Download

Visit https://data.4tu.nl/collections/Process_Mining/5065541, download `.xes.gz` files, decompress, and place in `tests/fixtures/`.

---

## Expected Behavior

**Benchmarks automatically detect dataset presence:**

```rust
// tests/benchmarks.rs
make_log(7_065)    // → loads BPI 2020 if present, else panics
make_log(1_050)    // → loads Sepsis if present
make_log(251_734)  // → loads BPI 2019 if present (Tier 3)
```

**CI/CD:**

- T0 + T1 must pass (Tier 1 datasets required)
- T2 runs if TIER ≥ 2 (optional, gated by env var)
- T3 runs if TIER ≥ 3 (optional, gated by env var)

---

## Reference Outputs

pm4py discovery outputs for parity verification:

- `pm4py_*.json` — Reference model shapes + metrics from pm4py-core

These are **read-only**; benchmarks compare wasm4pm outputs against these for regression detection.

---

## Licenses

All real datasets: CC BY 4.0 (4TU Research Data)  
Reference outputs: Generated by pm4py-core (Apache 2.0)

See https://data.4tu.nl/collections/Process_Mining/5065541 for individual dataset licenses and DOI citations.
