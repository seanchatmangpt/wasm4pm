# Real Data Benchmarking Plan for wasm4pm

**Decision:** Replace synthetic benchmarks with real industry datasets

---

## Current State
- **tests/benchmarks.rs:** 35 tests using synthetic data
- **Issue:** Synthetic data doesn't reflect real-world performance
- **Impact on THESIS.md:** Measured numbers are "real" but on unrealistic data

---

## Proposed Solution

### Step 1: Download Real Datasets
Use REAL-DATASETS.md sources:
- BPI Challenge 2020 Travel Permits (7,065 cases, 86,581 events)
- Production Analysis (6,849 cases, 34,245 events)  
- BPI Challenge 2012 (13,087 cases, 262,200 events)
- Road Traffic Fines (150,370 cases, 561,470 events) [optional — may be too large]

### Step 2: Load Datasets as Test Fixtures
Structure:
```
wasm4pm/
├── tests/
│   ├── benchmarks.rs (refactored)
│   └── fixtures/
│       ├── bpi_2020_travel.xes
│       ├── production_analysis.csv → .xes
│       ├── bpi_2012_loan.xes
│       └── traffic_fines.xes [optional]
```

### Step 3: Refactor 35 Tests
Each test loads a real dataset, measures execution time, no synthetic data generation.

Example:
```rust
#[test]
fn bench_dfg_on_real_bpi2020() {
    let log = load_fixture("bpi_2020_travel.xes");
    let h = store_log(log);
    let ms = median_ms(|| discover_dfg(&h, "concept:name"), 5);
    println!("DFG on BPI 2020 Travel: {:.2}ms", ms);
}
```

### Step 4: Results
- Real-world performance profiles (not synthetic)
- THESIS.md updated with actual numbers on real data
- Credible benchmarks for marketing/publication

---

## Challenges

1. **Download & Storage:** Real datasets are large (up to 561K events)
   - Solution: Commit BPI 2020 (smallest, most useful); others as optional downloads

2. **Test Runtime:** Tests may take longer on large datasets
   - Solution: Use subset of large datasets (e.g., first 50K events of Road Traffic Fines)

3. **Licensing:** Ensure datasets are properly credited
   - Solution: Document sources in benchmark comments, acknowledge 4TU/IEEE

---

## Recommendation

**Start with BPI 2020 Travel Permits variant (7K cases):**
- ✅ Real organizational data
- ✅ Reasonable size (< 100MB)
- ✅ Multiple variants available (test on each)
- ✅ Open license (CC BY 4.0)
- ✅ Reflects realistic process complexity

**Later add:**
- BPI 2012 for stress testing (200K+ events)
- Production Analysis for manufacturing domain
- Road Traffic Fines for ultimate scalability test

---

**Decision Point:** Should I refactor benchmarks.rs now to use real BPI 2020 data?

